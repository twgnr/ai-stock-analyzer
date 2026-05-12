import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import {
  fetchDividendRows,
  loadSharedSnapshot,
  type DividendRow,
} from "@/lib/dividendScreener";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * GET: Liefert den geteilten Snapshot der kuratierten Liste + optional
 * on-the-fly geladene Portfolio-/Watchlist-/Custom-Ticker (per Query-Param
 * oder Body — wir akzeptieren beides).
 *
 * POST: wie GET, aber erweitert um per-User-Ticker aus Body. Der Trigger
 * für einen tatsächlichen Rebuild liegt in /api/dividends/screener/scan.
 */

async function buildResponse(
  userId: string,
  includePortfolio: boolean,
  includeWatchlist: boolean,
  customTickers: string[]
) {
  const snapshot = await loadSharedSnapshot();
  const existing = new Set(snapshot.rows.map((r) => r.ticker.toUpperCase()));

  const extraTickers: string[] = [];
  if (includePortfolio || includeWatchlist) {
    await connectDB();
    const [positions, watchlist] = await Promise.all([
      includePortfolio
        ? Position.find({ userId }).select("ticker").lean()
        : Promise.resolve([]),
      includeWatchlist
        ? Watchlist.find({ userId }).select("ticker").lean()
        : Promise.resolve([]),
    ]);
    for (const p of positions) extraTickers.push(p.ticker.toUpperCase());
    for (const w of watchlist) extraTickers.push(w.ticker.toUpperCase());
  }
  for (const t of customTickers) extraTickers.push(t.toUpperCase().trim());
  const uniqueExtras = [...new Set(extraTickers)].filter(
    (t) => t && !existing.has(t)
  );

  let extraRows: DividendRow[] = [];
  if (uniqueExtras.length > 0) {
    extraRows = await fetchDividendRows(uniqueExtras, 6);
  }

  return NextResponse.json({
    rows: [...snapshot.rows, ...extraRows],
    snapshot: {
      scannedAt: snapshot.scannedAt,
      universeSize: snapshot.universeSize,
      scanDurationMs: snapshot.scanDurationMs,
      scanInProgress: snapshot.scanInProgress,
      sharedRowCount: snapshot.rows.length,
      extraRowCount: extraRows.length,
    },
  });
}

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const includePortfolio = sp.get("portfolio") === "true";
  const includeWatchlist = sp.get("watchlist") === "true";
  const customTickers = (sp.get("custom") || "")
    .split(/[,\s]+/)
    .filter(Boolean);
  return buildResponse(
    String(user._id),
    includePortfolio,
    includeWatchlist,
    customTickers
  );
}

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const includePortfolio = !!body?.includePortfolio;
  const includeWatchlist = !!body?.includeWatchlist;
  const customTickers: string[] = Array.isArray(body?.customTickers)
    ? body.customTickers
    : [];
  return buildResponse(
    String(user._id),
    includePortfolio,
    includeWatchlist,
    customTickers
  );
}

export const runtime = "nodejs";
export const maxDuration = 60;
