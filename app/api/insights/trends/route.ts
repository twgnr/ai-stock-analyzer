import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote } from "@/lib/yahoo";
import {
  getGoogleTrendsSnapshot,
  guessTrendsKeyword,
} from "@/lib/googleTrends";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * Liefert Google-Trends-Snapshot inkl. 90-Tage-Timeline und Top-3 stark
 * steigender Related Queries.
 */
export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  const geo = req.nextUrl.searchParams.get("geo") ?? "";

  try {
    const quote = await getQuote(ticker).catch(() => null);
    const keyword = guessTrendsKeyword(quote?.name || ticker);
    const snapshot = await getGoogleTrendsSnapshot(keyword, { geo, days: 90 });
    return NextResponse.json({
      ticker,
      name: quote?.name || ticker,
      keyword,
      snapshot,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 }
    );
  }
}
