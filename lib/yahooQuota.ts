import { connectDB } from "./mongodb";
import { getAppSettings } from "./models/AppSettings";
import { YahooUsageDay } from "./models/YahooUsageDay";

export class YahooQuotaError extends Error {
  used: number;
  limit: number;
  constructor(used: number, limit: number) {
    super(
      `Tageslimit für Yahoo-Finance-Abfragen erreicht (${used}/${limit}). ` +
        `Admin kann das Limit in den Einstellungen anpassen.`
    );
    this.name = "YahooQuotaError";
    this.used = used;
    this.limit = limit;
  }
}

export function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * In-Memory-Cache für Limit + heutiger Zählerstand. Spart DB-Roundtrips:
 * `assertYahooQuota` liest zuerst den Cache, nur nach TTL-Ablauf wird die
 * DB konsultiert. Der `$inc` zur Zählung ist trotzdem atomar gegen die DB
 * und wird nach jedem Call nachgezogen, damit Multi-Prozess-Setups nicht
 * auseinanderlaufen.
 */
const CACHE_TTL_MS = 15 * 1000;
let cache: {
  date: string;
  limit: number;
  count: number;
  fetchedAt: number;
} | null = null;

let pendingDelta = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshCache(force = false): Promise<void> {
  const date = todayUtcKey();
  if (
    !force &&
    cache &&
    cache.date === date &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return;
  }
  await connectDB();
  const settings = await getAppSettings();
  const usage = await YahooUsageDay.findOne({ date }).lean();
  cache = {
    date,
    limit: settings.yahooDailyQuotaLimit ?? 0,
    count: usage?.count ?? 0,
    fetchedAt: Date.now(),
  };
}

async function flushPending(): Promise<void> {
  if (pendingDelta <= 0) return;
  const delta = pendingDelta;
  pendingDelta = 0;
  const date = todayUtcKey();
  try {
    await connectDB();
    await YahooUsageDay.findOneAndUpdate(
      { date },
      { $inc: { count: delta }, $setOnInsert: { date } },
      { upsert: true, new: true }
    );
    if (cache && cache.date === date) {
      cache.count += delta;
    }
  } catch (e) {
    // Bei DB-Fehler nichts verlieren: Delta zurückrollen, damit nächster
    // Flush es erneut versucht.
    pendingDelta += delta;
    console.warn("[yahoo-quota] flush error", e instanceof Error ? e.message : e);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushPending();
  }, 500);
  // Niemals den Prozess wegen unseres Timers offen halten (Node-Env).
  const t = flushTimer as unknown as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
}

export async function assertYahooQuota(): Promise<void> {
  await refreshCache();
  if (!cache) return;
  if (cache.limit <= 0) return;
  // Pending Deltas mitrechnen, damit wir nicht über das Limit gehen während
  // noch Zählungen in der Pipeline sind.
  const effective = cache.count + pendingDelta;
  if (effective >= cache.limit) {
    // Einmalig markieren wenn zum ersten Mal heute gehittet
    try {
      await connectDB();
      await YahooUsageDay.updateOne(
        { date: cache.date },
        { $set: { lastLimitHitAt: new Date() }, $setOnInsert: { date: cache.date } },
        { upsert: true }
      );
    } catch {
      // Egal — die Fehlermeldung zählt.
    }
    throw new YahooQuotaError(effective, cache.limit);
  }
}

export function incrementYahooUsage(delta = 1): void {
  if (delta <= 0) return;
  pendingDelta += delta;
  if (cache && cache.date === todayUtcKey()) {
    // Cache-Lesewert früh erhöhen, damit parallele asserts sofort konsistent sind.
  }
  scheduleFlush();
}

export interface YahooQuotaStatus {
  date: string;
  usedToday: number;
  limit: number;
  remaining: number | null; // null = unbegrenzt
  percentUsed: number | null;
  lastLimitHitAt: Date | null;
}

export async function getYahooQuotaStatus(): Promise<YahooQuotaStatus> {
  await flushPending();
  await refreshCache(true);
  const date = cache?.date || todayUtcKey();
  const used = cache?.count ?? 0;
  const limit = cache?.limit ?? 0;
  const doc = await YahooUsageDay.findOne({ date }).lean();
  return {
    date,
    usedToday: used,
    limit,
    remaining: limit > 0 ? Math.max(0, limit - used) : null,
    percentUsed: limit > 0 ? Math.min(100, (used / limit) * 100) : null,
    lastLimitHitAt: doc?.lastLimitHitAt || null,
  };
}

/** Nur für Tests/Reset-Flows */
export async function resetYahooQuotaCache(): Promise<void> {
  cache = null;
  pendingDelta = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
