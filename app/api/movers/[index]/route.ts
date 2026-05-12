import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { MarketMoversSnapshot } from "@/lib/models/MarketMoversSnapshot";
import { getCurrentUser } from "@/lib/auth";
import {
  loadMoversSnapshot,
  fetchMoversLive,
  type MoversSnapshot,
} from "@/lib/marketMovers";
import {
  INDEX_META,
  SHARED_INDEX_KEYS,
  type IndexKey,
} from "@/lib/indexConstituents";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ index: string }> };

// Scanner-Identität wird in der DB für Audit-Zwecke gespeichert, aber nicht
// an andere User ausgeliefert.
function publicSnapshot(s: MoversSnapshot) {
  return {
    indexKey: s.indexKey,
    rows: s.rows,
    scannedAt: s.scannedAt,
    universeSize: s.universeSize,
    scanDurationMs: s.scanDurationMs,
    scanInProgress: s.scanInProgress,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { index } = await params;
  const key = index.toLowerCase();

  // Per-User Universes
  if (key === "portfolio" || key === "watchlist") {
    await connectDB();
    const rows =
      key === "portfolio"
        ? await Position.find({ userId: user._id }).select("ticker").lean()
        : await Watchlist.find({ userId: user._id }).select("ticker").lean();
    const tickers = [...new Set(rows.map((r) => r.ticker.toUpperCase()))];
    const snap = await fetchMoversLive(tickers);
    return NextResponse.json({
      indexKey: key,
      label: key === "portfolio" ? "Eigenes Portfolio" : "Eigene Watchlist",
      shared: false,
      snapshot: publicSnapshot(snap),
    });
  }

  // Shared Indizes
  if (!SHARED_INDEX_KEYS.includes(key as IndexKey)) {
    return NextResponse.json({ error: t("validation.unknownIndex") }, { status: 400 });
  }
  const indexKey = key as IndexKey;
  const snap = await loadMoversSnapshot(indexKey);

  // Signalisieren, dass irgendein User diesen Index gerade anschaut —
  // der Autoscan nutzt das, um nur aktiv angezeigte Indizes zu refreshen.
  // Fire-and-forget, der View-Ping darf die Antwort nicht blockieren.
  MarketMoversSnapshot.updateOne(
    { indexKey },
    { $set: { lastViewedAt: new Date() }, $setOnInsert: { indexKey } },
    { upsert: true }
  ).catch((e) =>
    console.warn("[movers] lastViewedAt update failed:", e instanceof Error ? e.message : e)
  );

  return NextResponse.json({
    indexKey,
    label: INDEX_META[indexKey].label,
    shared: true,
    snapshot: publicSnapshot(snap),
  });
}

export const runtime = "nodejs";
export const maxDuration = 30;
