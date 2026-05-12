import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote } from "@/lib/yahoo";
import {
  getArticlePageviews,
  guessWikipediaArticle,
} from "@/lib/wikipediaPageviews";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * Liefert Wikipedia-Pageviews für einen Ticker als Snapshot mit voller
 * Historie (60 Tage). Wird in der Aktien-Detail-Seite und im Markt-Radar
 * konsumiert.
 */
export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  try {
    const quote = await getQuote(ticker).catch(() => null);
    const article = guessWikipediaArticle(quote?.name || ticker);
    const series = await getArticlePageviews(article);
    return NextResponse.json({
      ticker,
      name: quote?.name || ticker,
      article,
      series,
      configured: series !== null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 }
    );
  }
}
