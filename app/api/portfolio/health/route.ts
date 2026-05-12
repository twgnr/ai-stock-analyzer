import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getQuotesBatch, yahooFinance } from "@/lib/yahoo";
import { scorePositionFactors } from "@/lib/factorExposure";
import { getApiTranslations } from "@/lib/i18n-server";

interface SubScore {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number; // Anteil am Gesamtscore
  explanation: string;
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const positions = await Position.find({ userId: user._id }).lean();
  if (positions.length === 0) {
    return NextResponse.json({ positions: 0, message: "Keine Positionen." });
  }

  const tickers = positions.map((p) => p.ticker.toUpperCase());
  const quotes = await getQuotesBatch(tickers);
  const qMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  // Sektor & erweiterte Fundamentals via quoteSummary (parallel)
  const summaries = await Promise.all(
    tickers.map(async (t) => {
      try {
        const s = await yahooFinance.quoteSummary(t, {
          modules: ["financialData", "summaryProfile"],
        });
        return { t, s };
      } catch {
        return { t, s: null };
      }
    })
  );
  const sMap = new Map(summaries.map((x) => [x.t, x.s] as const));

  // Positionen mit Metadata
  const enriched = positions.map((p) => {
    const t = p.ticker.toUpperCase();
    const q = qMap.get(t);
    const s = sMap.get(t);
    const price = q?.price ?? p.avgPrice;
    const value = price * p.shares;
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
    return {
      ticker: t,
      value,
      weight: 0,
      sector: s?.summaryProfile?.sector ?? "Unbekannt",
      scores,
      beta: q?.beta,
    };
  });
  const totalValue = enriched.reduce((s, p) => s + p.value, 0);
  for (const p of enriched) p.weight = totalValue > 0 ? p.value / totalValue : 0;

  // Sub-Score 1: Diversifikation (HHI-basiert, skaliert)
  const hhi = enriched.reduce((s, p) => s + p.weight * p.weight, 0);
  // HHI 1.0 (1 Position) → 0, HHI 0.1 (gleichverteilt 10) → sehr hoch
  // Skala: 0.5 → 25, 0.25 → 50, 0.1 → 80, 0.05 → 95
  const diversificationScore = Math.round(Math.max(0, Math.min(100, (1 - hhi) * 105 - 5)));
  const largestWeight = Math.max(...enriched.map((p) => p.weight));

  // Sektor-Diversifikation
  const sectorWeights = new Map<string, number>();
  for (const p of enriched) {
    sectorWeights.set(p.sector, (sectorWeights.get(p.sector) || 0) + p.weight);
  }
  const topSectorWeight = Math.max(...sectorWeights.values());

  // Sub-Score 2: Qualität (gewichteter Faktor-Quality)
  const qualityScore = Math.round(
    enriched.reduce((s, p) => s + p.scores.quality * p.weight, 0)
  );

  // Sub-Score 3: Bewertung (gewichteter Faktor-Value)
  const valueScore = Math.round(
    enriched.reduce((s, p) => s + p.scores.value * p.weight, 0)
  );

  // Sub-Score 4: Momentum (gewichteter Faktor-Momentum)
  const momentumScore = Math.round(
    enriched.reduce((s, p) => s + p.scores.momentum * p.weight, 0)
  );

  // Sub-Score 5: Risiko (ausreichend Positionen, moderates Beta, keine Klumpen)
  const avgBeta =
    enriched.reduce((s, p) => s + (p.beta ?? 1) * p.weight, 0) || 1;
  // Beta 1.0 = 100, 1.5 = 50, 2.0 = 0, 0.5 = 80 (leicht defensiv ist gut)
  let betaScore = 100 - Math.abs(avgBeta - 0.95) * 80;
  betaScore = Math.max(0, Math.min(100, betaScore));
  // Klumpen-Abzug: wenn größte Position > 30%, stark abziehen
  const concentrationPenalty = largestWeight > 0.3 ? (largestWeight - 0.3) * 250 : 0;
  const riskScore = Math.round(Math.max(0, betaScore - concentrationPenalty));

  const subScores: SubScore[] = [
    {
      key: "diversification",
      label: "Diversifikation",
      score: diversificationScore,
      weight: 0.25,
      explanation:
        enriched.length < 8
          ? `Nur ${enriched.length} Positionen — wenig Diversifikation.`
          : largestWeight > 0.25
            ? `Größte Position ${(largestWeight * 100).toFixed(1)}% — zu dominant.`
            : topSectorWeight > 0.5
              ? `Größter Sektor ${(topSectorWeight * 100).toFixed(0)}% — Sektor-Klumpen.`
              : "Verteilung ist gesund.",
    },
    {
      key: "quality",
      label: "Qualität",
      score: qualityScore,
      weight: 0.2,
      explanation:
        qualityScore >= 70
          ? "Hohe Margen, solide Bilanzen überwiegen."
          : qualityScore >= 50
            ? "Durchwachsene Qualität — einzelne Werte mit Bilanzrisiken."
            : "Viele Positionen mit dünnen Margen oder hoher Verschuldung.",
    },
    {
      key: "valuation",
      label: "Bewertung",
      score: valueScore,
      weight: 0.2,
      explanation:
        valueScore >= 70
          ? "Portfolio ist insgesamt günstig bewertet."
          : valueScore >= 40
            ? "Neutral bewertet."
            : "Viele Wachstumswerte mit hoher Bewertung.",
    },
    {
      key: "momentum",
      label: "Momentum",
      score: momentumScore,
      weight: 0.15,
      explanation:
        momentumScore >= 70
          ? "Viele Positionen nahe am 52W-Hoch."
          : momentumScore <= 30
            ? "Viele Positionen nahe am 52W-Tief — Value oder ausgestoppte Trades."
            : "Gemischt.",
    },
    {
      key: "risk",
      label: "Risiko & Klumpen",
      score: riskScore,
      weight: 0.2,
      explanation:
        concentrationPenalty > 5
          ? `Größte Position ${(largestWeight * 100).toFixed(1)}% — Klumpen-Risiko.`
          : avgBeta > 1.5
            ? `Durchschnittliches Beta ${avgBeta.toFixed(2)} — deutlich volatiler als Markt.`
            : "Moderates Gesamt-Risikoprofil.",
    },
  ];

  const totalScore = Math.round(
    subScores.reduce((s, sub) => s + sub.score * sub.weight, 0)
  );
  const grade =
    totalScore >= 80
      ? "A"
      : totalScore >= 65
        ? "B"
        : totalScore >= 50
          ? "C"
          : totalScore >= 35
            ? "D"
            : "F";

  return NextResponse.json({
    positions: enriched.length,
    totalValue,
    totalScore,
    grade,
    subScores,
    stats: {
      hhi,
      largestWeight,
      topSectorWeight,
      avgBeta,
      sectorCount: sectorWeights.size,
    },
  });
}

export const runtime = "nodejs";
