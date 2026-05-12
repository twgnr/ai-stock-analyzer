/**
 * Auto-Update-Service: hält die in-Memory-Caches für alle relevanten User-Daten
 * frisch, damit User beim Login keine kalten Caches sehen.
 *
 * Was wird aktualisiert:
 *  1. **Quotes** für alle eindeutigen Position+Watchlist-Tickers (batched).
 *     Das warm-cached den Yahoo-Quote-Cache (60s TTL) bzw. die Provider-Cascade.
 *  2. **Movers-Snapshots** (Top-10/Flop-10) für alle scanbaren Indizes —
 *     unabhängig davon, ob sie gerade angeschaut werden.
 *
 * Der Service wird vom Cron-Job alle X Minuten aufgerufen (siehe lib/cron.ts).
 * Aktivierung + Intervall sind in den Admin-Settings konfigurierbar.
 */

import { connectDB } from "./mongodb";
import { AppSettings, getAppSettings } from "./models/AppSettings";
import { Position } from "./models/Position";
import { Watchlist } from "./models/Watchlist";
import { MarketMoversSnapshot } from "./models/MarketMoversSnapshot";
import { User } from "./models/User";
import { getQuotesBatch } from "./yahoo";
import { rebuildMoversSnapshot, type MoversProvider } from "./marketMovers";
import type { IndexKey } from "./indexConstituents";
import { shouldScanIndex, isWithinExtendedTradingWindow } from "./tradingHours";
import { decryptSecret } from "./secretCrypto";

/** Wenn der jüngste lastSeenAt jünger als dieser Wert ist, gilt mind. ein
 *  User als aktiv. Bei 5 min toleriert das einen kurzen Tab-Wechsel ohne
 *  den Auto-Update sofort abzuschalten. */
const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;

const QUOTE_CHUNK_SIZE = 50;
const SCANNABLE_INDICES: IndexKey[] = [
  "dax",
  "mdax",
  "sdax",
  "tecdax",
  "xetra",
  "dow",
  "sp500",
  "nasdaq100",
];

export interface AutoUpdateResult {
  ok: boolean;
  reason?: string;
  tickersRefreshed: number;
  quotesFetched: number;
  moversScanned: number;
  moversFailed: number;
  durationMs: number;
  startedAt: string;
}

async function hasRecentlyActiveUser(now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - ACTIVE_USER_WINDOW_MS);
  const active = await User.exists({ lastSeenAt: { $gte: cutoff } });
  return !!active;
}

export async function shouldRunAutoUpdate(): Promise<{
  shouldRun: boolean;
  reason: string;
  intervalMinutes?: number;
  lastRunAt?: Date;
}> {
  await connectDB();
  const settings = await getAppSettings();
  if (!settings.autoUpdateEnabled) {
    return { shouldRun: false, reason: "Auto-Update ist deaktiviert." };
  }
  const intervalMinutes = Math.max(5, settings.autoUpdateIntervalMinutes ?? 30);
  const lastRunAt = settings.autoUpdateLastRunAt
    ? new Date(settings.autoUpdateLastRunAt)
    : null;
  if (lastRunAt) {
    const ageMin = (Date.now() - lastRunAt.getTime()) / 60000;
    if (ageMin < intervalMinutes) {
      return {
        shouldRun: false,
        reason: `Letzter Lauf vor ${ageMin.toFixed(1)} Min — Intervall ${intervalMinutes} Min noch nicht erreicht.`,
        intervalMinutes,
        lastRunAt,
      };
    }
  }
  const now = new Date();
  if (!isWithinExtendedTradingWindow(now)) {
    return {
      shouldRun: false,
      reason: "Außerhalb der Handelszeiten (Mo–Fr 09:00–23:00 MEZ).",
      intervalMinutes,
      lastRunAt: lastRunAt ?? undefined,
    };
  }
  if (!(await hasRecentlyActiveUser(now))) {
    return {
      shouldRun: false,
      reason: `Kein User in den letzten ${Math.round(ACTIVE_USER_WINDOW_MS / 60000)} Min aktiv.`,
      intervalMinutes,
      lastRunAt: lastRunAt ?? undefined,
    };
  }
  return { shouldRun: true, reason: "fällig", intervalMinutes, lastRunAt: lastRunAt ?? undefined };
}

/**
 * Sammelt alle eindeutigen Tickers über alle User (Positions + Watchlists)
 * und holt für sie in Batches die aktuellen Quotes. Das warm-cached die
 * Yahoo-Caches, sodass User-Sessions sofort frische Daten sehen.
 */
async function refreshAllUserTickers(): Promise<{
  tickers: number;
  quotesFetched: number;
}> {
  const [positions, watchlist] = await Promise.all([
    Position.find().select("ticker").lean(),
    Watchlist.find().select("ticker").lean(),
  ]);

  const seen = new Set<string>();
  for (const p of positions) seen.add(p.ticker.toUpperCase());
  for (const w of watchlist) seen.add(w.ticker.toUpperCase());

  const list = Array.from(seen);
  if (list.length === 0) return { tickers: 0, quotesFetched: 0 };

  let fetched = 0;
  for (let i = 0; i < list.length; i += QUOTE_CHUNK_SIZE) {
    const chunk = list.slice(i, i + QUOTE_CHUNK_SIZE);
    try {
      const quotes = await getQuotesBatch(chunk);
      fetched += quotes.length;
    } catch (e) {
      console.warn(
        `[autoupdate] quote-batch chunk ${i} failed:`,
        e instanceof Error ? e.message : e
      );
    }
  }
  return { tickers: list.length, quotesFetched: fetched };
}

/**
 * Movers-Snapshots für alle scanbaren Indizes neu bauen — anders als beim
 * existierenden /api/movers/autoscan-Endpoint **ohne** lastViewedAt-Filter,
 * weil der Admin explizit alle Daten frisch halten will.
 */
async function refreshAllMovers(): Promise<{
  scanned: number;
  failed: number;
}> {
  const settings = await getAppSettings();
  const provider: MoversProvider =
    settings.moversAutoScanProvider === "finnhub" ? "finnhub" : "yahoo";
  const finnhubKey = decryptSecret(settings.quoteProviders?.finnhubApiKey) || "";
  const tradingOnly = settings.moversAutoScanTradingHoursOnly !== false;

  if (provider === "finnhub" && !finnhubKey) {
    console.warn("[autoupdate] Finnhub gewählt, aber kein Key — überspringe Movers");
    return { scanned: 0, failed: 0 };
  }

  const existing = await MarketMoversSnapshot.find({
    indexKey: { $in: SCANNABLE_INDICES },
  })
    .select({ indexKey: 1, scanInProgress: 1 })
    .lean();
  const byKey = new Map(existing.map((d) => [d.indexKey, d]));

  let scanned = 0;
  let failed = 0;
  const now = new Date();

  for (const idx of SCANNABLE_INDICES) {
    if (tradingOnly) {
      const trading = shouldScanIndex(idx, now);
      if (!trading.ok) continue;
    }
    if (byKey.get(idx)?.scanInProgress) continue;
    try {
      const res = await rebuildMoversSnapshot(
        idx,
        { email: "autoupdate@system", name: "Auto-Update" },
        { provider, finnhubApiKey: finnhubKey }
      );
      if (res.ok) scanned++;
      else failed++;
    } catch (e) {
      console.warn(
        `[autoupdate] movers ${idx} failed:`,
        e instanceof Error ? e.message : e
      );
      failed++;
    }
  }
  return { scanned, failed };
}

export async function runAutoUpdate(force = false): Promise<AutoUpdateResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  if (!force) {
    const check = await shouldRunAutoUpdate();
    if (!check.shouldRun) {
      return {
        ok: false,
        reason: check.reason,
        tickersRefreshed: 0,
        quotesFetched: 0,
        moversScanned: 0,
        moversFailed: 0,
        durationMs: 0,
        startedAt,
      };
    }
  }

  await connectDB();

  let tickersRefreshed = 0;
  let quotesFetched = 0;
  let moversScanned = 0;
  let moversFailed = 0;

  try {
    const tickers = await refreshAllUserTickers();
    tickersRefreshed = tickers.tickers;
    quotesFetched = tickers.quotesFetched;
  } catch (e) {
    console.error("[autoupdate] tickers-step failed:", e);
  }

  try {
    const movers = await refreshAllMovers();
    moversScanned = movers.scanned;
    moversFailed = movers.failed;
  } catch (e) {
    console.error("[autoupdate] movers-step failed:", e);
  }

  const durationMs = Date.now() - t0;

  // Run-Stempel speichern, damit shouldRunAutoUpdate beim nächsten Tick weiß,
  // dass das Intervall erst nach `autoUpdateIntervalMinutes` wieder fällig ist.
  try {
    await AppSettings.updateOne(
      { key: "global" },
      {
        $set: {
          autoUpdateLastRunAt: new Date(),
          autoUpdateLastDurationMs: durationMs,
          autoUpdateLastTickerCount: tickersRefreshed,
        },
      }
    );
  } catch (e) {
    console.warn("[autoupdate] persist last-run failed:", e);
  }

  return {
    ok: true,
    tickersRefreshed,
    quotesFetched,
    moversScanned,
    moversFailed,
    durationMs,
    startedAt,
  };
}
