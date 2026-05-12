import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote, getNews, getEarningsData, getChart } from "@/lib/yahoo";
import { analyzeEarningsReaction, hasClaudeKey } from "@/lib/claude";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const { ticker } = await req.json();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  const symbol = String(ticker).toUpperCase();

  try {
    const [quote, earnings, news, candles] = await Promise.all([
      getQuote(symbol),
      getEarningsData(symbol),
      getNews(symbol, 12),
      getChart(symbol, "3mo", "1d").catch(() => []),
    ]);

    if (!earnings || earnings.quarterlyEPS.length === 0) {
      return NextResponse.json(
        { error: "Keine Earnings-Daten für diesen Ticker gefunden" },
        { status: 404 }
      );
    }

    let priceChange5d = 0;
    let priceChange30d = 0;
    if (candles.length > 5) {
      const last = candles[candles.length - 1].close;
      const d5 = candles[Math.max(0, candles.length - 6)].close;
      const d30 = candles[Math.max(0, candles.length - 22)].close;
      priceChange5d = d5 ? ((last - d5) / d5) * 100 : 0;
      priceChange30d = d30 ? ((last - d30) / d30) * 100 : 0;
    }

    const result = await analyzeEarningsReaction(
      {
        ticker: symbol,
        name: quote.name,
        currentPrice: quote.price,
        currency: quote.currency,
        recentPriceChange30d: priceChange30d,
        recentPriceChange5d: priceChange5d,
        lastEarningsDate: earnings.lastEarningsDate,
        quarterlyEPS: earnings.quarterlyEPS,
        quarterlyRevenue: earnings.quarterlyRevenue,
        news: news.map((n) => ({
          title: n.title,
          publisher: n.publisher,
          publishedAt: n.publishedAt,
        })),
      },
      user
    );

    return NextResponse.json({
      ...result,
      ticker: symbol,
      name: quote.name,
      priceChange5d,
      priceChange30d,
      lastEarningsDate: earnings.lastEarningsDate,
      nextEarningsDate: earnings.nextEarningsDate,
      epsHistory: earnings.quarterlyEPS.slice(0, 6),
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Earnings-Analyse-Fehler");
  }
}
