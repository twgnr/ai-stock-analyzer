import type { ScreenerQuote } from "./yahoo";

export interface ScreenerFilters {
  regions?: Array<"DE" | "EU" | "US" | "AS">;
  minMarketCap?: number;
  maxPE?: number;
  minPE?: number;
  maxForwardPE?: number;
  minDividendYield?: number;
  minPriceToBook?: number;
  maxPriceToBook?: number;
  position52W?: "near_low" | "near_high" | "any";
  minChangePercent?: number;
  maxChangePercent?: number;
  preset?: "value" | "growth" | "dividend" | "oversold" | "momentum" | null;
}

export interface ScreenerResult extends ScreenerQuote {
  position52W: number;
  region: "DE" | "EU" | "US" | "AS";
  matches: string[];
}

const PRESETS: Record<NonNullable<ScreenerFilters["preset"]>, ScreenerFilters> = {
  value: { maxPE: 15, maxPriceToBook: 2.5, minMarketCap: 1_000_000_000 },
  growth: { minMarketCap: 5_000_000_000, position52W: "near_high" },
  dividend: { minDividendYield: 3, minMarketCap: 2_000_000_000 },
  oversold: { position52W: "near_low", minMarketCap: 1_000_000_000 },
  momentum: { minChangePercent: 2, minMarketCap: 1_000_000_000 },
};

export function applyFilters(
  quotes: Array<ScreenerQuote & { region: "DE" | "EU" | "US" | "AS" }>,
  filters: ScreenerFilters
): ScreenerResult[] {
  const effective = filters.preset
    ? { ...PRESETS[filters.preset], ...filters, preset: filters.preset }
    : filters;

  return quotes
    .map((q) => {
      const position52W =
        q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh > q.fiftyTwoWeekLow
          ? ((q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100
          : 50;
      return { ...q, position52W } as ScreenerResult;
    })
    .filter((q) => {
      const matches: string[] = [];
      let pass = true;

      if (effective.regions && effective.regions.length > 0) {
        if (!effective.regions.includes(q.region)) pass = false;
      }
      if (effective.minMarketCap != null && (q.marketCap ?? 0) < effective.minMarketCap) pass = false;
      if (effective.maxPE != null && (q.trailingPE == null || q.trailingPE > effective.maxPE || q.trailingPE < 0)) pass = false;
      if (effective.minPE != null && (q.trailingPE == null || q.trailingPE < effective.minPE)) pass = false;
      if (effective.maxForwardPE != null && (q.forwardPE == null || q.forwardPE > effective.maxForwardPE || q.forwardPE < 0)) pass = false;
      if (effective.minDividendYield != null) {
        const y = (q.dividendYield ?? 0) * 100;
        if (y < effective.minDividendYield) pass = false;
      }
      if (effective.minPriceToBook != null && (q.priceToBook == null || q.priceToBook < effective.minPriceToBook)) pass = false;
      if (effective.maxPriceToBook != null && (q.priceToBook == null || q.priceToBook > effective.maxPriceToBook)) pass = false;
      if (effective.position52W === "near_low" && q.position52W > 30) pass = false;
      if (effective.position52W === "near_high" && q.position52W < 80) pass = false;
      if (effective.minChangePercent != null && q.changePercent < effective.minChangePercent) pass = false;
      if (effective.maxChangePercent != null && q.changePercent > effective.maxChangePercent) pass = false;

      if (pass) {
        if (q.position52W < 20) matches.push("Nahe 52W-Tief");
        else if (q.position52W > 80) matches.push("Nahe 52W-Hoch");
        if (q.trailingPE != null && q.trailingPE > 0 && q.trailingPE < 15) matches.push("KGV < 15");
        if ((q.dividendYield ?? 0) * 100 >= 4) matches.push("Div > 4%");
        if (q.changePercent >= 3) matches.push("Starker Tag");
        if (q.changePercent <= -3) matches.push("Abverkauf");
      }
      q.matches = matches;
      return pass;
    });
}
