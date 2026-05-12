import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes, getFundamentals } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { getApiTranslations } from "@/lib/i18n-server";

interface Bucket {
  label: string;
  valueBase: number;
  weight: number;
  tickers: string[];
}

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

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const positions = await Position.find({ userId: user._id }).lean();
  if (positions.length === 0) {
    return NextResponse.json({ sectors: [], regions: [], totalValueBase: 0 });
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

  const sectorBuckets = new Map<string, Bucket>();
  const regionBuckets = new Map<string, Bucket>();
  let totalValueBase = 0;

  for (const p of positions) {
    const q = quoteMap.get(p.ticker);
    const price = q?.price ?? p.avgPrice;
    const currency = q?.currency || p.currency;
    const value = price * p.shares * rateFor(currency);
    totalValueBase += value;

    const sector = sectorMap.get(p.ticker) || "Unbekannt";
    const region = regionFromTicker(p.ticker);

    const sEntry = sectorBuckets.get(sector) || { label: sector, valueBase: 0, weight: 0, tickers: [] };
    sEntry.valueBase += value;
    sEntry.tickers.push(p.ticker);
    sectorBuckets.set(sector, sEntry);

    const rEntry = regionBuckets.get(region) || { label: region, valueBase: 0, weight: 0, tickers: [] };
    rEntry.valueBase += value;
    rEntry.tickers.push(p.ticker);
    regionBuckets.set(region, rEntry);
  }

  const sectors = [...sectorBuckets.values()]
    .map((b) => ({ ...b, weight: totalValueBase > 0 ? (b.valueBase / totalValueBase) * 100 : 0 }))
    .sort((a, b) => b.valueBase - a.valueBase);
  const regions = [...regionBuckets.values()]
    .map((b) => ({ ...b, weight: totalValueBase > 0 ? (b.valueBase / totalValueBase) * 100 : 0 }))
    .sort((a, b) => b.valueBase - a.valueBase);

  return NextResponse.json({ sectors, regions, totalValueBase, baseCurrency: BASE_CURRENCY });
}
