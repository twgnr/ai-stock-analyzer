/**
 * Aggregiert Dividenden-Daten + Fundamentals für einen Ticker und liefert
 * eine einheitliche Zeile für den Screener. Cache ist prozess-lokal
 * (in-memory, 1h TTL) — erster Aufruf für ein Universum ist langsam
 * (jeder Ticker braucht 2-3 Yahoo-Calls), danach schnell.
 */

import { getDividendInfo, getFundamentals, getQuote } from "./yahoo";
import { connectDB } from "./mongodb";
import { DividendScreenerSnapshot } from "./models/DividendScreenerSnapshot";
import { DIVIDEND_UNIVERSE } from "./dividendUniverse";

export interface DividendRow {
  ticker: string;
  name?: string;
  currency: string;
  price?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
  country?: string;
  region: string;
  // Dividenden
  dividendRate?: number;
  dividendYieldPct?: number;
  payoutRatioPct?: number;
  payoutsPerYear: number;
  payoutFrequency: string;
  exDividendDate?: string;
  growthCagr3yPct?: number | null;
  growthCagr5yPct?: number | null;
  growthCagr10yPct?: number | null;
  streakYears: number;
  // Bewertung
  peRatio?: number;
  beta?: number;
  // Score (0-100)
  score: number;
  /** Einzel-Komponenten-Score für UI-Tooltip */
  scoreBreakdown?: {
    yield: number;
    growth: number;
    safety: number;
    streak: number;
  };
}

interface CacheEntry {
  at: number;
  row: DividendRow | null;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function regionFromTicker(ticker: string): string {
  const t = ticker.toUpperCase();
  if (t.endsWith(".DE") || t.endsWith(".F")) return "Deutschland";
  if (
    t.endsWith(".SW") ||
    t.endsWith(".AS") ||
    t.endsWith(".BR") ||
    t.endsWith(".BE") ||
    t.endsWith(".PA") ||
    t.endsWith(".MI") ||
    t.endsWith(".MC") ||
    t.endsWith(".L") ||
    t.endsWith(".ST") ||
    t.endsWith(".CO") ||
    t.endsWith(".OL") ||
    t.endsWith(".HE") ||
    t.endsWith(".IR") ||
    t.endsWith(".VI")
  )
    return "Europa";
  if (
    t.endsWith(".T") ||
    t.endsWith(".HK") ||
    t.endsWith(".TW") ||
    t.endsWith(".KS") ||
    t.endsWith(".KQ") ||
    t.endsWith(".SI") ||
    t.endsWith(".SS") ||
    t.endsWith(".SZ")
  )
    return "Asien";
  if (t.endsWith(".TO") || t.endsWith(".V")) return "Kanada";
  if (t.endsWith(".AX")) return "Australien";
  return "USA";
}

function computeScore(row: Omit<DividendRow, "score" | "scoreBreakdown">) {
  // Yield-Score: clamped bei 8% um Dividend-Traps zu dämpfen
  const y = row.dividendYieldPct ?? 0;
  const yScore = Math.min(25, (Math.min(y, 8) / 8) * 25);

  // Growth-Score: 5J-CAGR
  const g = row.growthCagr5yPct ?? row.growthCagr3yPct ?? 0;
  const gScore = Math.max(0, Math.min(30, (g / 15) * 30));

  // Safety: niedrige Payout-Ratio ist gut (< 60% voll, > 90% ungünstig)
  let safetyScore = 15;
  if (row.payoutRatioPct != null) {
    if (row.payoutRatioPct <= 60) safetyScore = 20;
    else if (row.payoutRatioPct <= 80) safetyScore = 12;
    else if (row.payoutRatioPct <= 100) safetyScore = 6;
    else safetyScore = 0;
  }

  // Streak: linear bis 25 Jahre
  const streakScore = Math.min(25, (row.streakYears / 25) * 25);

  const total = yScore + gScore + safetyScore + streakScore;
  return {
    score: Math.round(total),
    breakdown: {
      yield: Math.round(yScore),
      growth: Math.round(gScore),
      safety: Math.round(safetyScore),
      streak: Math.round(streakScore),
    },
  };
}

async function fetchRowUncached(ticker: string): Promise<DividendRow | null> {
  const [divInfo, fundamentals, quote] = await Promise.all([
    getDividendInfo(ticker).catch(() => null),
    getFundamentals(ticker).catch(() => null),
    getQuote(ticker).catch(() => null),
  ]);
  if (!divInfo || divInfo.dividendRate == null || divInfo.dividendRate <= 0) {
    return null; // kein Dividenden-Zahler
  }
  const partial: Omit<DividendRow, "score" | "scoreBreakdown"> = {
    ticker: divInfo.ticker,
    name: divInfo.name || quote?.name,
    currency: divInfo.currency,
    price: quote?.price,
    marketCap: fundamentals?.marketCap,
    sector: fundamentals?.sector,
    industry: fundamentals?.industry,
    country: fundamentals?.country,
    region: regionFromTicker(divInfo.ticker),
    dividendRate: divInfo.dividendRate,
    dividendYieldPct:
      divInfo.dividendYield != null ? divInfo.dividendYield * 100 : undefined,
    payoutRatioPct:
      divInfo.payoutRatio != null ? divInfo.payoutRatio * 100 : undefined,
    payoutsPerYear: divInfo.payoutsPerYear,
    payoutFrequency: divInfo.payoutFrequency,
    exDividendDate: divInfo.exDividendDate,
    growthCagr3yPct: divInfo.growthCagr3y,
    growthCagr5yPct: divInfo.growthCagr5y,
    growthCagr10yPct: divInfo.growthCagr10y,
    streakYears: divInfo.dividendGrowthStreakYears,
    peRatio: fundamentals?.peRatio,
    beta: fundamentals?.beta,
  };
  const { score, breakdown } = computeScore(partial);
  return { ...partial, score, scoreBreakdown: breakdown };
}

export async function fetchDividendRow(
  ticker: string
): Promise<DividendRow | null> {
  const key = ticker.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.row;

  const row = await fetchRowUncached(key);
  cache.set(key, { at: Date.now(), row });
  return row;
}

/**
 * Holt mehrere Ticker mit begrenzter Parallelität, damit Yahoo nicht
 * throtteln. Liefert alle Dividenden-Zahler als Array.
 */
export async function fetchDividendRows(
  tickers: string[],
  concurrency = 6
): Promise<DividendRow[]> {
  const results: DividendRow[] = [];
  const queue = [...tickers];
  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) return;
      try {
        const row = await fetchDividendRow(t);
        if (row) results.push(row);
      } catch {
        // Ticker ignorieren, Rest läuft weiter
      }
    }
  }
  const workers = Array(Math.min(concurrency, tickers.length))
    .fill(0)
    .map(() => worker());
  await Promise.all(workers);
  return results;
}

export function getCacheStats(): { entries: number; dividendPayers: number } {
  let payers = 0;
  for (const v of cache.values()) if (v.row) payers++;
  return { entries: cache.size, dividendPayers: payers };
}

// ============================================================
// Shared Snapshot (DB-basiert)
// ============================================================
//
// Der DB-Snapshot hält das Ergebnis des letzten Scans der kuratierten
// DIVIDEND_UNIVERSE-Liste. Alle User sehen ihn; jeder kann „Neu scannen"
// triggern, was die Daten für alle auffrischt.

export interface SharedSnapshot {
  rows: DividendRow[];
  scannedAt: Date | null;
  scannedByEmail: string | null;
  scannedByName: string | null;
  universeSize: number;
  scanDurationMs: number | null;
  scanInProgress: boolean;
  scanStartedAt: Date | null;
}

export async function loadSharedSnapshot(): Promise<SharedSnapshot> {
  await connectDB();
  const doc = await DividendScreenerSnapshot.findOne({ key: "global" }).lean();
  if (!doc) {
    return {
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
    rows: (doc.rows as DividendRow[]) || [],
    scannedAt: doc.scannedAt || null,
    scannedByEmail: doc.scannedByEmail || null,
    scannedByName: doc.scannedByName || null,
    universeSize: doc.universeSize || 0,
    scanDurationMs: doc.scanDurationMs || null,
    scanInProgress: !!doc.scanInProgress,
    scanStartedAt: doc.scanStartedAt || null,
  };
}

const STALE_SCAN_MS = 10 * 60 * 1000; // 10 Min — ältere "inProgress"-Locks gelten als abgestürzt

/**
 * Erwirbt das Scan-Lock atomar. Wenn bereits ein Scan läuft (jünger
 * als 10 Min), gibt null zurück — Caller soll 409 melden.
 */
async function acquireScanLock(): Promise<boolean> {
  await connectDB();
  const staleCutoff = new Date(Date.now() - STALE_SCAN_MS);
  const res = await DividendScreenerSnapshot.findOneAndUpdate(
    {
      key: "global",
      $or: [
        { scanInProgress: false },
        { scanInProgress: { $exists: false } },
        { scanStartedAt: { $lt: staleCutoff } },
      ],
    },
    {
      $set: { scanInProgress: true, scanStartedAt: new Date() },
      $setOnInsert: { key: "global", rows: [], universeSize: 0 },
    },
    { new: true, upsert: true }
  );
  return !!res;
}

async function releaseScanLock(
  rows: DividendRow[],
  universeSize: number,
  durationMs: number,
  by: { email: string; name?: string }
) {
  await connectDB();
  await DividendScreenerSnapshot.updateOne(
    { key: "global" },
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

async function releaseScanLockOnError() {
  await connectDB();
  await DividendScreenerSnapshot.updateOne(
    { key: "global" },
    { $set: { scanInProgress: false }, $unset: { scanStartedAt: "" } }
  );
}

export async function rebuildSharedSnapshot(by: {
  email: string;
  name?: string;
}): Promise<{ ok: boolean; reason?: string; snapshot?: SharedSnapshot }> {
  const locked = await acquireScanLock();
  if (!locked) {
    return { ok: false, reason: "Ein Scan läuft bereits. Bitte warten." };
  }
  const startedAt = Date.now();
  try {
    // In-Memory-Cache löschen, damit wir wirklich frische Yahoo-Daten holen
    cache.clear();
    const rows = await fetchDividendRows(DIVIDEND_UNIVERSE, 6);
    const durationMs = Date.now() - startedAt;
    await releaseScanLock(rows, DIVIDEND_UNIVERSE.length, durationMs, by);
    const snap = await loadSharedSnapshot();
    return { ok: true, snapshot: snap };
  } catch (e) {
    await releaseScanLockOnError();
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Scan-Fehler",
    };
  }
}
