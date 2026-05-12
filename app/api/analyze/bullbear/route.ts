import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { analyzeBullBear, hasClaudeKey } from "@/lib/claude";
import { getQuote, getFundamentals, getNews } from "@/lib/yahoo";
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
    const quote = await getQuote(symbol);
    const [fundamentals, news] = await Promise.all([
      getFundamentals(symbol),
      getNews(symbol, 10),
    ]);

    const result = await analyzeBullBear(
      {
        ticker: symbol,
        name: quote.name,
        price: quote.price,
        currency: quote.currency,
        changePercent: quote.changePercent,
        fundamentals: fundamentals as Record<string, unknown> | null,
        news: news.map((n) => ({
          title: n.title,
          publisher: n.publisher,
          publishedAt: n.publishedAt,
        })),
      },
      user
    );

    return NextResponse.json({
      ticker: symbol,
      currency: quote.currency,
      currentPrice: quote.price,
      ...result,
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Fehler");
  }
}

export const runtime = "nodejs";
