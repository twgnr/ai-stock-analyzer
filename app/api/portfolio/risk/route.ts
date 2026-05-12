import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getChart, getQuotes } from "@/lib/yahoo";
import {
  computeVar,
  dailyReturnsFromCloses,
  runMonteCarlo,
  runStress,
  weightedPortfolioReturns,
} from "@/lib/risk";
import { getApiTranslations } from "@/lib/i18n-server";

interface SeriesPoint {
  date: string;
  close: number;
}

async function loadSeries(ticker: string): Promise<{ dates: string[]; closes: number[] } | null> {
  try {
    const candles = await getChart(ticker, "5y", "1d");
    if (!candles || candles.length < 100) return null;
    const points: SeriesPoint[] = candles.map((c) => ({
      date: new Date(c.time * 1000).toISOString().slice(0, 10),
      close: c.close,
    }));
    return {
      dates: points.map((p) => p.date),
      closes: points.map((p) => p.close),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const positions = await Position.find({ userId: user._id }).lean();
  if (positions.length === 0) {
    return NextResponse.json({
      positions: 0,
      message: "Keine Positionen im Portfolio.",
    });
  }

  const tickers = positions.map((p) => p.ticker.toUpperCase());
  const quotes = await getQuotes(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  // Gewichte in Basiswährung EUR (grob: nur native price × shares, FX wird
  // hier zu Gunsten der Lesbarkeit weggelassen; Abweichungen im niedrigen %-
  // Bereich sind für Risiko-Aussagen unerheblich).
  const weights = new Map<string, number>();
  let totalValue = 0;
  for (const p of positions) {
    const t = p.ticker.toUpperCase();
    const q = quoteMap.get(t);
    const price = q?.price ?? p.avgPrice;
    const value = price * p.shares;
    weights.set(t, value);
    totalValue += value;
  }

  // Historische Kurse über 5 Jahre holen — parallel, aber mit Limit
  const series = new Map<string, { dates: string[]; closes: number[] }>();
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 6) chunks.push(tickers.slice(i, i + 6));
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(async (t) => ({ t, s: await loadSeries(t) })));
    for (const r of results) {
      if (r.s) series.set(r.t, r.s);
    }
  }

  const missingHistory = tickers.filter((t) => !series.has(t));

  const portReturns = weightedPortfolioReturns(series, weights);
  const var95 = computeVar(portReturns, 0.95);
  const var99 = computeVar(portReturns, 0.99);
  const stress = runStress(series, weights);
  const monteCarlo = runMonteCarlo(portReturns, 252, 1000);

  return NextResponse.json({
    positions: positions.length,
    totalValue,
    returnsObservations: portReturns.length,
    missingHistory,
    var95,
    var99,
    stress,
    monteCarlo,
  });
}

export const runtime = "nodejs";
