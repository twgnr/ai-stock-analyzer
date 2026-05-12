import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Analysis } from "@/lib/models/Analysis";
import { getQuote, getQuotes, getFundamentals } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { sizePosition, hasClaudeKey } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
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

  const body = await req.json();
  const ticker = body.ticker;
  const riskProfile = (body.riskProfile || "moderate") as
    | "conservative"
    | "moderate"
    | "aggressive";
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const symbol = String(ticker).toUpperCase();

  try {
    await connectDB();

    const [quote, fundamentals, existing, allPositions] = await Promise.all([
      getQuote(symbol),
      getFundamentals(symbol),
      Position.findOne({ userId: user._id, ticker: symbol }).lean(),
      Position.find({ userId: user._id }).lean(),
    ]);

    const allTickers = allPositions.map((p) => p.ticker);
    const portfolioQuotes = allTickers.length ? await getQuotes(allTickers) : [];
    const quoteMap = new Map(portfolioQuotes.map((q) => [q.ticker, q]));

    const currencies = [
      ...new Set<string>(
        portfolioQuotes
          .map((q) => q.currency)
          .concat(allPositions.map((p) => p.currency))
          .concat([quote.currency])
      ),
    ];
    const fxRates = await getRates(currencies, BASE_CURRENCY);

    let portfolioValueBase = 0;
    let existingWeight = 0;
    for (const p of allPositions) {
      const q = quoteMap.get(p.ticker);
      if (!q) continue;
      const rate = q.currency === BASE_CURRENCY ? 1 : fxRates[q.currency.toUpperCase()] ?? 0;
      const valBase = q.price * p.shares * rate;
      portfolioValueBase += valBase;
    }
    if (existing) {
      const q = quoteMap.get(existing.ticker);
      if (q) {
        const rate = q.currency === BASE_CURRENCY ? 1 : fxRates[q.currency.toUpperCase()] ?? 0;
        const existingValueBase = q.price * existing.shares * rate;
        existingWeight =
          portfolioValueBase > 0 ? (existingValueBase / portfolioValueBase) * 100 : 0;
      }
    }

    const fxRate =
      quote.currency === BASE_CURRENCY ? 1 : fxRates[quote.currency.toUpperCase()] ?? 0;

    const latestAnalysis = await Analysis.findOne({ ticker: symbol, kind: "single" })
      .sort({ createdAt: -1 })
      .lean();

    const existingPosition = existing
      ? {
          shares: existing.shares,
          avgPrice: existing.avgPrice,
          marketValueBase: quote.price * existing.shares * fxRate,
          weightPercent: existingWeight,
          unrealizedPct: ((quote.price - existing.avgPrice) / existing.avgPrice) * 100,
        }
      : undefined;

    const result = await sizePosition(
      {
        ticker: symbol,
        name: quote.name,
        currentPrice: quote.price,
        currency: quote.currency,
        fxRate,
        baseCurrency: BASE_CURRENCY,
        portfolioValueBase,
        positionCount: allPositions.length,
        existingPosition,
        fundamentals: fundamentals as Record<string, unknown> | null,
        latestRecommendation: latestAnalysis?.recommendation,
        riskProfile,
      },
      user
    );

    return NextResponse.json({
      ...result,
      baseCurrency: BASE_CURRENCY,
      currentPortfolioValue: portfolioValueBase,
      existingWeight,
      riskProfile,
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Sizing-Fehler");
  }
}
