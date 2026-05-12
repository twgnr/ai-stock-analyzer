import { connectDB } from "./mongodb";
import { Analysis } from "./models/Analysis";
import { getQuotesBatch, getFundamentals, type ScreenerQuote } from "./yahoo";

export interface ConvictionBreakdown {
  analyst: number;
  valuation: number;
  position52W: number;
  aiRecommendation: number;
  momentum: number;
}

export interface ConvictionResult {
  ticker: string;
  score: number;
  breakdown: ConvictionBreakdown;
  label: "Sehr hoch" | "Hoch" | "Mittel" | "Gering" | "Sehr gering";
}

function scoreAnalyst(mean?: number, count?: number): number {
  if (mean == null || !(count && count >= 3)) return 0;
  // Yahoo: 1 = Strong Buy, 5 = Sell
  // Convert: 1 → 25, 2 → 20, 3 → 12, 4 → 5, 5 → 0
  if (mean <= 1.5) return 25;
  if (mean <= 2.0) return 22;
  if (mean <= 2.5) return 16;
  if (mean <= 3.0) return 10;
  if (mean <= 3.5) return 5;
  return 0;
}

function scoreValuation(peTTM?: number, peForward?: number): number {
  const pe = peForward ?? peTTM;
  if (pe == null || pe <= 0) return 0;
  if (pe < 10) return 20;
  if (pe < 15) return 18;
  if (pe < 20) return 14;
  if (pe < 25) return 10;
  if (pe < 35) return 5;
  if (pe < 50) return 2;
  return 0;
}

function score52WPosition(price: number, low?: number, high?: number): number {
  if (!low || !high || high <= low) return 0;
  const pos = (price - low) / (high - low);
  // Lower = more upside = higher score
  if (pos < 0.15) return 20;
  if (pos < 0.3) return 16;
  if (pos < 0.5) return 12;
  if (pos < 0.7) return 8;
  if (pos < 0.85) return 4;
  return 0;
}

function scoreAIRecommendation(
  rec?: string,
  confidence?: number,
  // ageDays bleibt im Signature für die `latestAIAgeDays`-Output-Info, wird
  // aber nicht mehr als Cutoff verwendet — alte Empfehlungen zählen weiterhin
  // mit ihrem Score, bis der User explizit eine neue Analyse startet.
  _ageDays?: number
): number {
  if (!rec) return 0;
  const conf = confidence ?? 0.5;
  const multiplier = Math.min(1, Math.max(0, conf));
  let base = 0;
  switch (rec) {
    case "BUY":
    case "ACCUMULATE":
      base = 20;
      break;
    case "HOLD":
      base = 10;
      break;
    case "REDUCE":
      base = 4;
      break;
    case "SELL":
      base = 0;
      break;
    default:
      base = 5;
  }
  return Math.round(base * (0.6 + 0.4 * multiplier));
}

function scoreMomentum(changePercent: number, volume?: number, avgVolume?: number): number {
  let score = 0;
  if (changePercent > 1) score += 5;
  if (changePercent > 3) score += 3;
  if (changePercent < -3) score -= 3;
  if (volume && avgVolume && avgVolume > 0 && volume > avgVolume * 1.3) score += 5;
  return Math.max(0, Math.min(15, score));
}

function labelFor(score: number): ConvictionResult["label"] {
  if (score >= 75) return "Sehr hoch";
  if (score >= 60) return "Hoch";
  if (score >= 40) return "Mittel";
  if (score >= 20) return "Gering";
  return "Sehr gering";
}

interface ComputeInput {
  ticker: string;
  price: number;
  changePercent: number;
  volume?: number;
  trailingPE?: number;
  forwardPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  analystMean?: number;
  analystCount?: number;
  avgVolume?: number;
  latestAIRec?: string;
  latestAIConfidence?: number;
  latestAIAgeDays?: number;
}

export function computeConvictionScore(input: ComputeInput): ConvictionResult {
  const analyst = scoreAnalyst(input.analystMean, input.analystCount);
  const valuation = scoreValuation(input.trailingPE, input.forwardPE);
  const position52W = score52WPosition(
    input.price,
    input.fiftyTwoWeekLow,
    input.fiftyTwoWeekHigh
  );
  const aiRecommendation = scoreAIRecommendation(
    input.latestAIRec,
    input.latestAIConfidence,
    input.latestAIAgeDays
  );
  const momentum = scoreMomentum(input.changePercent, input.volume, input.avgVolume);
  const score = analyst + valuation + position52W + aiRecommendation + momentum;

  return {
    ticker: input.ticker,
    score,
    breakdown: { analyst, valuation, position52W, aiRecommendation, momentum },
    label: labelFor(score),
  };
}

interface YahooFundamentalSource {
  trailingPE?: number;
  forwardPE?: number | null;
  recommendationMean?: number;
  numberOfAnalysts?: number;
}

export async function computeConvictionForTickers(
  tickers: string[]
): Promise<Map<string, ConvictionResult>> {
  if (tickers.length === 0) return new Map();
  await connectDB();

  const quotes = await getQuotesBatch(tickers);
  const quoteMap = new Map<string, ScreenerQuote>(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  const analysisDocs = await Analysis.find({
    ticker: { $in: tickers.map((t) => t.toUpperCase()) },
    kind: "single",
  })
    .sort({ createdAt: -1 })
    .lean();

  const latestByTicker = new Map<string, (typeof analysisDocs)[number]>();
  for (const a of analysisDocs) {
    const key = a.ticker.toUpperCase();
    if (!latestByTicker.has(key)) latestByTicker.set(key, a);
  }

  const fundamentalsResults = await Promise.all(
    tickers.map((t) =>
      getFundamentals(t).catch(() => null as YahooFundamentalSource | null)
    )
  );

  const results = new Map<string, ConvictionResult>();
  const now = Date.now();

  tickers.forEach((ticker, i) => {
    const upper = ticker.toUpperCase();
    const q = quoteMap.get(upper);
    if (!q) return;
    const fund = fundamentalsResults[i] as YahooFundamentalSource | null;
    const analysis = latestByTicker.get(upper);
    const ageDays = analysis
      ? (now - new Date(analysis.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      : undefined;

    const score = computeConvictionScore({
      ticker: upper,
      price: q.price,
      changePercent: q.changePercent,
      volume: q.volume,
      trailingPE: q.trailingPE ?? fund?.trailingPE,
      forwardPE: q.forwardPE ?? fund?.forwardPE ?? undefined,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      analystMean: fund?.recommendationMean,
      analystCount: fund?.numberOfAnalysts,
      latestAIRec: analysis?.recommendation,
      latestAIConfidence: analysis?.confidence,
      latestAIAgeDays: ageDays,
    });

    results.set(upper, score);
  });

  return results;
}
