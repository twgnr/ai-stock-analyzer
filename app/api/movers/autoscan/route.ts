import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { getAppSettings } from "@/lib/models/AppSettings";
import { MarketMoversSnapshot } from "@/lib/models/MarketMoversSnapshot";
import { rebuildMoversSnapshot, type MoversProvider } from "@/lib/marketMovers";
import type { IndexKey } from "@/lib/indexConstituents";
import { shouldScanIndex } from "@/lib/tradingHours";
import { decryptSecret } from "@/lib/secretCrypto";
import { getApiTranslations } from "@/lib/i18n-server";

// Alle Indizes, die autoscannbar sind. Portfolio/Watchlist sind per-User und
// werden live gepullt, wenn der User sie öffnet — gehören hier nicht rein.
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

export async function POST() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const settings = await getAppSettings();
  if (!settings.moversAutoScanEnabled) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }

  const intervalMinutes = Math.max(5, settings.moversAutoScanIntervalMinutes ?? 30);
  const staleCutoff = Date.now() - intervalMinutes * 60 * 1000;
  const provider: MoversProvider = settings.moversAutoScanProvider === "finnhub" ? "finnhub" : "yahoo";
  const finnhubKey = decryptSecret(settings.quoteProviders?.finnhubApiKey) || "";
  const tradingOnly = settings.moversAutoScanTradingHoursOnly !== false;

  if (provider === "finnhub" && !finnhubKey) {
    return NextResponse.json(
      { ok: false, error: "Finnhub als Provider gewählt, aber kein API-Key hinterlegt." },
      { status: 400 }
    );
  }

  // Ein Index gilt als „aktiv angeschaut", wenn in den letzten 10 Minuten
  // mindestens ein User das Widget mit diesem Index geöffnet und nicht
  // eingeklappt hatte. Das Widget pingt den GET-Endpoint dieser Index beim
  // Mount und anschließend periodisch — dadurch wird `lastViewedAt` frisch
  // gehalten. Ungeöffnete Indizes werden nie gescannt, auch nicht zu
  // Börsenzeiten — spart Yahoo/Finnhub-Quota.
  const VIEW_WINDOW_MS = 10 * 60 * 1000;
  const viewedCutoff = new Date(Date.now() - VIEW_WINDOW_MS);

  const existing = await MarketMoversSnapshot.find({
    indexKey: { $in: SCANNABLE_INDICES },
  })
    .select({ indexKey: 1, scannedAt: 1, scanInProgress: 1, lastViewedAt: 1 })
    .lean();
  const byKey = new Map(existing.map((d) => [d.indexKey, d]));

  const now = new Date();
  const toScan: IndexKey[] = [];
  const skipped: Array<{ index: IndexKey; reason: string }> = [];

  for (const idx of SCANNABLE_INDICES) {
    const snap = byKey.get(idx);
    const lastViewed = snap?.lastViewedAt
      ? new Date(snap.lastViewedAt)
      : null;
    if (!lastViewed || lastViewed < viewedCutoff) {
      skipped.push({ index: idx, reason: "Wird von keinem User angezeigt" });
      continue;
    }
    if (tradingOnly) {
      const trading = shouldScanIndex(idx, now);
      if (!trading.ok) {
        skipped.push({ index: idx, reason: trading.reason || "Handelszeiten" });
        continue;
      }
    }
    if (snap?.scanInProgress) {
      skipped.push({ index: idx, reason: "Scan läuft bereits" });
      continue;
    }
    const lastScanMs = snap?.scannedAt ? new Date(snap.scannedAt).getTime() : 0;
    if (lastScanMs > staleCutoff) {
      const ageMin = Math.round((Date.now() - lastScanMs) / 60000);
      skipped.push({ index: idx, reason: `Noch frisch (${ageMin} Min alt)` });
      continue;
    }
    toScan.push(idx);
  }

  const scanned: Array<{ index: IndexKey; rows: number; durationMs: number | null }> = [];
  const failed: Array<{ index: IndexKey; reason: string }> = [];

  for (const idx of toScan) {
    const t0 = Date.now();
    const res = await rebuildMoversSnapshot(
      idx,
      { email: "autoscan@system", name: "Auto-Scan" },
      { provider, finnhubApiKey: finnhubKey }
    );
    if (res.ok) {
      scanned.push({
        index: idx,
        rows: res.snapshot?.rows.length ?? 0,
        durationMs: Date.now() - t0,
      });
    } else {
      failed.push({ index: idx, reason: res.reason || "Scan-Fehler" });
    }
  }

  return NextResponse.json({
    ok: true,
    provider,
    triggeredBy: user.email,
    scanned,
    skipped,
    failed,
  });
}

export const runtime = "nodejs";
