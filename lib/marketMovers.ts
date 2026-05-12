import { connectDB } from "./mongodb";
import {
  MarketMoversSnapshot,
  type IMoverRow,
} from "./models/MarketMoversSnapshot";
import { getQuotesBatch } from "./yahoo";
import { getFinnhubQuotesBatch } from "./finnhub";
import { INDEX_META, type IndexKey } from "./indexConstituents";

export type MoversProvider = "yahoo" | "finnhub";

export interface MoversSnapshot {
  indexKey: string;
  rows: IMoverRow[];
  scannedAt: Date | null;
  scannedByEmail: string | null;
  scannedByName: string | null;
  universeSize: number;
  scanDurationMs: number | null;
  scanInProgress: boolean;
  scanStartedAt: Date | null;
}

const STALE_SCAN_MS = 10 * 60 * 1000;

export async function loadMoversSnapshot(
  indexKey: IndexKey
): Promise<MoversSnapshot> {
  await connectDB();
  const doc = await MarketMoversSnapshot.findOne({ indexKey }).lean();
  if (!doc) {
    return {
      indexKey,
      rows: [],
      scannedAt: null,
      scannedByEmail: null,
      scannedByName: null,
      universeSize: 0,
      scanDurationMs: null,
      scanInProgress: false,
      scanStartedAt: null,
    };
  }
  return {
    indexKey,
    rows: (doc.rows as IMoverRow[]) || [],
    scannedAt: doc.scannedAt || null,
    scannedByEmail: doc.scannedByEmail || null,
    scannedByName: doc.scannedByName || null,
    universeSize: doc.universeSize || 0,
    scanDurationMs: doc.scanDurationMs || null,
    scanInProgress: !!doc.scanInProgress,
    scanStartedAt: doc.scanStartedAt || null,
  };
}

async function acquireScanLock(indexKey: IndexKey): Promise<boolean> {
  await connectDB();
  const staleCutoff = new Date(Date.now() - STALE_SCAN_MS);
  const res = await MarketMoversSnapshot.findOneAndUpdate(
    {
      indexKey,
      $or: [
        { scanInProgress: false },
        { scanInProgress: { $exists: false } },
        { scanStartedAt: { $lt: staleCutoff } },
      ],
    },
    {
      $set: { scanInProgress: true, scanStartedAt: new Date() },
      $setOnInsert: { indexKey, rows: [], universeSize: 0 },
    },
    { new: true, upsert: true }
  );
  return !!res;
}

async function releaseScanLock(
  indexKey: IndexKey,
  rows: IMoverRow[],
  universeSize: number,
  durationMs: number,
  by: { email: string; name?: string }
) {
  await connectDB();
  await MarketMoversSnapshot.updateOne(
    { indexKey },
    {
      $set: {
        scanInProgress: false,
        rows,
        universeSize,
        scannedAt: new Date(),
        scannedByEmail: by.email,
        scannedByName: by.name,
        scanDurationMs: durationMs,
      },
      $unset: { scanStartedAt: "" },
    }
  );
}

async function releaseScanLockOnError(indexKey: IndexKey) {
  await connectDB();
  await MarketMoversSnapshot.updateOne(
    { indexKey },
    { $set: { scanInProgress: false }, $unset: { scanStartedAt: "" } }
  );
}

export async function rebuildMoversSnapshot(
  indexKey: IndexKey,
  by: { email: string; name?: string },
  options: { provider?: MoversProvider; finnhubApiKey?: string } = {}
): Promise<{ ok: boolean; reason?: string; snapshot?: MoversSnapshot }> {
  const meta = INDEX_META[indexKey];
  if (!meta) return { ok: false, reason: "Unbekannter Index" };

  const provider = options.provider || "yahoo";
  if (provider === "finnhub" && !options.finnhubApiKey) {
    return { ok: false, reason: "Finnhub-Key fehlt für Movers-Scan." };
  }

  const locked = await acquireScanLock(indexKey);
  if (!locked) {
    return { ok: false, reason: "Ein Scan läuft bereits für diesen Index." };
  }
  const startedAt = Date.now();
  try {
    let rows: IMoverRow[];
    if (provider === "finnhub") {
      const quotes = await getFinnhubQuotesBatch(
        meta.constituents,
        options.finnhubApiKey!
      );
      rows = quotes
        .filter((q) => q.price > 0)
        .map((q) => ({
          ticker: q.ticker,
          name: q.ticker, // Finnhub /quote liefert keinen Namen
          price: q.price,
          changePct: q.changePercent,
          currency: q.currency,
          marketCap: undefined,
        }))
        .sort((a, b) => b.changePct - a.changePct);
    } else {
      const quotes = await getQuotesBatch(meta.constituents);
      rows = quotes
        .filter((q) => q.price > 0)
        .map((q) => ({
          ticker: q.ticker,
          name: q.name,
          price: q.price,
          changePct: q.changePercent,
          currency: q.currency,
          marketCap: q.marketCap,
        }))
        .sort((a, b) => b.changePct - a.changePct);
    }

    await releaseScanLock(
      indexKey,
      rows,
      meta.constituents.length,
      Date.now() - startedAt,
      by
    );
    const snap = await loadMoversSnapshot(indexKey);
    return { ok: true, snapshot: snap };
  } catch (e) {
    await releaseScanLockOnError(indexKey);
    return { ok: false, reason: e instanceof Error ? e.message : "Scan-Fehler" };
  }
}

/**
 * Berechnet Movers on-the-fly (für Portfolio/Watchlist — per-user, kein
 * DB-Snapshot). Die Menge ist klein, also ist Live-Fetching akzeptabel.
 */
export async function fetchMoversLive(
  tickers: string[]
): Promise<MoversSnapshot> {
  if (tickers.length === 0) {
    return {
      indexKey: "live",
      rows: [],
      scannedAt: new Date(),
      scannedByEmail: null,
      scannedByName: null,
      universeSize: 0,
      scanDurationMs: 0,
      scanInProgress: false,
      scanStartedAt: null,
    };
  }
  const started = Date.now();
  const quotes = await getQuotesBatch(tickers);
  const rows: IMoverRow[] = quotes
    .filter((q) => q.price > 0)
    .map((q) => ({
      ticker: q.ticker,
      name: q.name,
      price: q.price,
      changePct: q.changePercent,
      currency: q.currency,
      marketCap: q.marketCap,
    }))
    .sort((a, b) => b.changePct - a.changePct);
  return {
    indexKey: "live",
    rows,
    scannedAt: new Date(),
    scannedByEmail: null,
    scannedByName: null,
    universeSize: tickers.length,
    scanDurationMs: Date.now() - started,
    scanInProgress: false,
    scanStartedAt: null,
  };
}
