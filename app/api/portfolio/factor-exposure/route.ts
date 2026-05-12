import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getQuotesBatch, yahooFinance } from "@/lib/yahoo";
import {
  aggregatePortfolioFactors,
  scorePositionFactors,
  type FactorScores,
} from "@/lib/factorExposure";
import { getApiTranslations } from "@/lib/i18n-server";

interface PerPosition {
  ticker: string;
  name?: string;
  weight: number;
  marketValue: number;
  scores: FactorScores;
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
  const quotes = await getQuotesBatch(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  // Financial-/Margin-Daten nicht im Batch-Quote enthalten → quoteSummary pro Ticker
  const summaries = await Promise.all(
    tickers.map(async (t) => {
      try {
        const s = await yahooFinance.quoteSummary(t, {
          modules: ["financialData", "summaryDetail"],
        });
        return { t, s };
      } catch {
        return { t, s: null };
      }
    })
  );
  const summaryMap = new Map(summaries.map((x) => [x.t, x.s] as const));

  const perPosition: PerPosition[] = [];
  for (const p of positions) {
    const t = p.ticker.toUpperCase();
    const q = quoteMap.get(t);
    const s = summaryMap.get(t);
    const price = q?.price ?? p.avgPrice;
    const marketValue = price * p.shares;

    const scores = scorePositionFactors({
      marketCap: q?.marketCap,
      peRatio: q?.trailingPE,
      priceToBook: q?.priceToBook,
      revenueGrowth: s?.financialData?.revenueGrowth,
      earningsGrowth: s?.financialData?.earningsGrowth,
      profitMargin: s?.financialData?.profitMargins,
      operatingMargin: s?.financialData?.operatingMargins,
      debtToEquity: s?.financialData?.debtToEquity,
      price,
      fiftyTwoWeekHigh: q?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q?.fiftyTwoWeekLow,
    });

    perPosition.push({
      ticker: t,
      name: q?.name,
      weight: marketValue,
      marketValue,
      scores,
    });
  }

  const totalValue = perPosition.reduce((s, p) => s + p.marketValue, 0);
  for (const p of perPosition) {
    p.weight = totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0;
  }
  const aggregate = aggregatePortfolioFactors(
    perPosition.map((p) => ({ weight: p.weight, scores: p.scores }))
  );

  return NextResponse.json({
    positions: positions.length,
    totalValue,
    perPosition: perPosition.sort((a, b) => b.weight - a.weight),
    aggregate,
  });
}

export const runtime = "nodejs";
