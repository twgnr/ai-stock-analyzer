import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getQuotes, getFundamentals } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { analyzePortfolio, hasClaudeKey } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiError";
import {
  computeLookThrough,
  formatLookThroughForPrompt,
} from "@/lib/etfHoldings";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST() {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: tr("ai.noKey") },
      { status: 503 }
    );
  }

  try {
    await connectDB();
    const positions = await Position.find({ userId: user._id }).lean();
    if (positions.length === 0) {
      return NextResponse.json({ error: tr("resource.portfolioEmpty") }, { status: 400 });
    }

    const tickers = positions.map((p) => p.ticker);
    const quotes = await getQuotes(tickers);
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

    const currencies = [
      ...new Set<string>(quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))),
    ];
    const fxRates = await getRates(currencies, BASE_CURRENCY);

    const fundamentalsResults = await Promise.all(
      tickers.map((t) => getFundamentals(t).catch(() => null))
    );
    const sectorMap = new Map<string, string | undefined>();
    tickers.forEach((t, i) => sectorMap.set(t, fundamentalsResults[i]?.sector));

    let totalValueBase = 0;
    const enriched = positions
      .map((p) => {
        const q = quoteMap.get(p.ticker);
        if (!q) return null;
        const marketValue = q.price * p.shares;
        const rate = q.currency === BASE_CURRENCY ? 1 : fxRates[q.currency.toUpperCase()] ?? 0;
        const marketValueBase = marketValue * rate;
        totalValueBase += marketValueBase;
        return {
          ticker: p.ticker,
          name: q.name,
          shares: p.shares,
          avgPrice: p.avgPrice,
          currentPrice: q.price,
          currency: q.currency,
          marketValue: marketValueBase,
          sector: sectorMap.get(p.ticker),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const withWeights = enriched.map((e) => ({
      ...e,
      weight: totalValueBase > 0 ? (e.marketValue / totalValueBase) * 100 : 0,
    }));

    // Look-Through auf ETF-Positionen — verwendet Yahoo `topHoldings`. Wenn
    // keine ETFs im Portfolio sind, ist das ein No-Op.
    const directWeights: Record<string, number> = {};
    for (const p of withWeights) directWeights[p.ticker] = p.weight;
    const lookThrough = await computeLookThrough(directWeights).catch(() => null);
    const lookThroughBlock = lookThrough ? formatLookThroughForPrompt(lookThrough) : "";

    const result = await analyzePortfolio(
      withWeights,
      totalValueBase,
      BASE_CURRENCY,
      user,
      { lookThroughBlock }
    );
    return NextResponse.json({
      ...result,
      totalValue: totalValueBase,
      baseCurrency: BASE_CURRENCY,
      positionCount: withWeights.length,
      lookThroughEtfs: lookThrough?.etfTickers ?? [],
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Portfolio-Analyse fehlgeschlagen");
  }
}
