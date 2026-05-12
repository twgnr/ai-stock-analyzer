import type { EnrichedPosition } from "@/components/PortfolioTable";

interface RawPosition {
  _id: string;
  ticker: string;
  name?: string;
  shares: number;
  avgPrice: number;
  currency: string;
}

interface Quote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export function enrichPortfolio(
  positions: RawPosition[],
  quotes: Quote[],
  fxRates: Record<string, number> = {},
  baseCurrency: string = "EUR"
): EnrichedPosition[] {
  const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
  const base = baseCurrency.toUpperCase();
  const rateFor = (cur: string) => {
    const c = cur.toUpperCase();
    if (c === base) return 1;
    return fxRates[c] ?? 0;
  };

  const enriched = positions.map((p) => {
    const q = quoteMap.get(p.ticker.toUpperCase());
    const tradingCurrency = (q?.currency || p.currency).toUpperCase();
    const purchaseCurrency = p.currency.toUpperCase();
    const currentPriceNative = q?.price ?? p.avgPrice;

    const tradingRate = rateFor(tradingCurrency);
    const purchaseRate = rateFor(purchaseCurrency);

    const currentPriceBase = currentPriceNative * tradingRate;
    const avgPriceBase = p.avgPrice * purchaseRate;

    const marketValueBase = currentPriceBase * p.shares;
    const costBasisBase = avgPriceBase * p.shares;
    const unrealizedPLBase = marketValueBase - costBasisBase;
    const unrealizedPctBase = costBasisBase ? (unrealizedPLBase / costBasisBase) * 100 : 0;

    const todayChangeBase = q?.change ? q.change * p.shares * tradingRate : 0;

    return {
      _id: p._id,
      ticker: p.ticker,
      name: q?.name || p.name || p.ticker,
      shares: p.shares,
      avgPrice: p.avgPrice,
      avgPriceBase,
      currentPrice: currentPriceNative,
      currentPriceBase,
      purchaseCurrency,
      tradingCurrency,
      change: q?.change ?? 0,
      changePercent: q?.changePercent ?? 0,
      marketValue: currentPriceNative * p.shares,
      marketValueBase,
      costBasis: p.avgPrice * p.shares,
      costBasisBase,
      unrealizedPL: (currentPriceNative - p.avgPrice) * p.shares,
      unrealizedPLBase,
      unrealizedPct: p.avgPrice ? ((currentPriceNative - p.avgPrice) / p.avgPrice) * 100 : 0,
      unrealizedPctBase,
      weight: 0,
      todayChangeBase,
      tradingRate,
      purchaseRate,
      baseCurrency: base,
    };
  });

  const totalBase = enriched.reduce((s, p) => s + p.marketValueBase, 0);
  for (const p of enriched) {
    p.weight = totalBase > 0 ? (p.marketValueBase / totalBase) * 100 : 0;
  }
  return enriched;
}
