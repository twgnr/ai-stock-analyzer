import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes, getFundamentals } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { findPortfolioGaps, hasClaudeKey } from "@/lib/claude";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

function regionFromTicker(ticker: string): string {
  const upper = ticker.toUpperCase();
  const dot = upper.indexOf(".");
  if (dot < 0) return "USA";
  const suffix = upper.slice(dot + 1);
  if (suffix === "DE") return "Deutschland";
  if (["AS", "BR", "BE", "PA", "MI", "MC", "L", "SW", "ST", "CO", "OL"].includes(suffix))
    return "Europa";
  if (["T", "HK", "TW", "KS", "KQ", "SI"].includes(suffix)) return "Asien";
  return "Andere";
}

export async function POST() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  try {
    await connectDB();
    const positions = await Position.find({ userId: user._id }).lean();
    if (positions.length === 0) {
      return NextResponse.json({ error: t("resource.portfolioEmpty") }, { status: 400 });
    }

    const tickers = positions.map((p) => p.ticker);
    const [quotes, fundamentalsList] = await Promise.all([
      getQuotes(tickers),
      Promise.all(tickers.map((t) => getFundamentals(t).catch(() => null))),
    ]);
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
    const sectorMap = new Map<string, string | undefined>();
    tickers.forEach((t, i) => sectorMap.set(t, fundamentalsList[i]?.sector));

    const currencies = [
      ...new Set<string>(quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))),
    ];
    const fxRates = await getRates(currencies, BASE_CURRENCY);
    const rateFor = (c: string) =>
      c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

    const sectorBuckets = new Map<string, { valueBase: number; tickers: string[] }>();
    const regionBuckets = new Map<string, { valueBase: number; tickers: string[] }>();
    let totalValueBase = 0;

    for (const p of positions) {
      const q = quoteMap.get(p.ticker);
      const price = q?.price ?? p.avgPrice;
      const currency = q?.currency || p.currency;
      const value = price * p.shares * rateFor(currency);
      totalValueBase += value;

      const sector = sectorMap.get(p.ticker) || "Unbekannt";
      const region = regionFromTicker(p.ticker);
      const s = sectorBuckets.get(sector) || { valueBase: 0, tickers: [] };
      s.valueBase += value;
      s.tickers.push(p.ticker);
      sectorBuckets.set(sector, s);
      const r = regionBuckets.get(region) || { valueBase: 0, tickers: [] };
      r.valueBase += value;
      r.tickers.push(p.ticker);
      regionBuckets.set(region, r);
    }

    const sectors = [...sectorBuckets.entries()]
      .map(([label, b]) => ({
        label,
        weight: totalValueBase > 0 ? (b.valueBase / totalValueBase) * 100 : 0,
        tickers: b.tickers,
      }))
      .sort((a, b) => b.weight - a.weight);
    const regions = [...regionBuckets.entries()]
      .map(([label, b]) => ({
        label,
        weight: totalValueBase > 0 ? (b.valueBase / totalValueBase) * 100 : 0,
        tickers: b.tickers,
      }))
      .sort((a, b) => b.weight - a.weight);

    const result = await findPortfolioGaps(
      {
        totalValueBase,
        baseCurrency: BASE_CURRENCY,
        sectors,
        regions,
        allTickers: tickers,
      },
      user
    );

    return NextResponse.json({
      ...result,
      totalValueBase,
      baseCurrency: BASE_CURRENCY,
      sectors,
      regions,
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Portfolio-Gaps-Analyse fehlgeschlagen");
  }
}
