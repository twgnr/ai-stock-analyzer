import type { Candle } from "./yahoo";
import { sma, rsi, bollingerBandwidth, avgVolume } from "./indicators";

export interface BreakoutSignals {
  distFrom52WHigh: number;
  bollingerBandwidth: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  volumeRatio: number | null;
  trendAligned: boolean;
  hasConsolidation: boolean;
  rsiHealthy: boolean;
  volumeDryUp: boolean;
  nearHigh: boolean;
}

export interface BreakoutAnalysis {
  score: number;
  signals: BreakoutSignals;
  reasons: string[];
}

export interface BreakoutInput {
  candles: Candle[];
  price: number;
  fiftyTwoWeekHigh: number;
}

export function analyzeBreakout(input: BreakoutInput): BreakoutAnalysis | null {
  const { candles, price, fiftyTwoWeekHigh } = input;
  if (candles.length < 50) return null;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const sma20Val = sma(closes, 20);
  const sma50Val = sma(closes, 50);
  const sma200Val = sma(closes, 200);
  const rsi14Val = rsi(closes, 14);
  const bwVal = bollingerBandwidth(closes, 20);
  const avgVol20 = avgVolume(volumes, 20);
  const avgVol5 = avgVolume(volumes, 5);
  const volumeRatio = avgVol20 && avgVol20 > 0 && avgVol5 != null ? avgVol5 / avgVol20 : null;

  const distFrom52WHigh =
    fiftyTwoWeekHigh > 0 ? (fiftyTwoWeekHigh - price) / fiftyTwoWeekHigh : 1;

  let score = 0;
  const reasons: string[] = [];

  if (distFrom52WHigh < 0.03) {
    score += 30;
    reasons.push("<3% vom 52W-Hoch");
  } else if (distFrom52WHigh < 0.06) {
    score += 25;
    reasons.push("<6% vom 52W-Hoch");
  } else if (distFrom52WHigh < 0.1) {
    score += 18;
    reasons.push("<10% vom 52W-Hoch");
  } else if (distFrom52WHigh < 0.15) {
    score += 10;
    reasons.push("<15% vom 52W-Hoch");
  }
  const nearHigh = distFrom52WHigh < 0.1;

  let hasConsolidation = false;
  if (bwVal != null) {
    if (bwVal < 0.05) {
      score += 25;
      reasons.push("Sehr enge Range (BB-Squeeze)");
      hasConsolidation = true;
    } else if (bwVal < 0.08) {
      score += 18;
      reasons.push("Enge Range");
      hasConsolidation = true;
    } else if (bwVal < 0.12) {
      score += 10;
      reasons.push("Moderate Range");
    }
  }

  let trendAligned = false;
  if (sma50Val != null && sma200Val != null) {
    if (price > sma50Val && sma50Val > sma200Val) {
      score += 20;
      reasons.push("Trend: Kurs > 50d > 200d");
      trendAligned = true;
    } else if (sma20Val != null && price > sma20Val && sma20Val > sma50Val) {
      score += 12;
      reasons.push("Kurzfristiger Aufwärtstrend");
    }
  } else if (sma50Val != null && price > sma50Val) {
    score += 8;
    reasons.push("Kurs > 50d-SMA");
  }

  let rsiHealthy = false;
  if (rsi14Val != null) {
    if (rsi14Val >= 50 && rsi14Val <= 65) {
      score += 15;
      reasons.push(`RSI ${rsi14Val.toFixed(0)} (bullish)`);
      rsiHealthy = true;
    } else if ((rsi14Val >= 45 && rsi14Val < 50) || (rsi14Val > 65 && rsi14Val <= 70)) {
      score += 10;
      reasons.push(`RSI ${rsi14Val.toFixed(0)} (neutral-bullish)`);
      rsiHealthy = true;
    } else if ((rsi14Val >= 40 && rsi14Val < 45) || (rsi14Val > 70 && rsi14Val <= 75)) {
      score += 5;
    }
  }

  let volumeDryUp = false;
  if (volumeRatio != null) {
    if (volumeRatio >= 0.7 && volumeRatio <= 0.95) {
      score += 10;
      reasons.push("Volumen trocknet aus");
      volumeDryUp = true;
    } else if (volumeRatio > 0.95 && volumeRatio <= 1.15) {
      score += 5;
    } else if (volumeRatio > 1.5) {
      score += 3;
      reasons.push("Volumen-Spike");
    }
  }

  return {
    score,
    reasons,
    signals: {
      distFrom52WHigh,
      bollingerBandwidth: bwVal,
      sma20: sma20Val,
      sma50: sma50Val,
      sma200: sma200Val,
      rsi14: rsi14Val,
      volumeRatio,
      trendAligned,
      hasConsolidation,
      rsiHealthy,
      volumeDryUp,
      nearHigh,
    },
  };
}

/**
 * Catalyst-Score: optionale „weiche" Signale aus Aufmerksamkeits-/News-/
 * Insider-Daten, die zum technischen Score addiert werden können. Maximal
 * 25 Punkte — der technische Score (0–100) bleibt damit bestimmend.
 */
export interface CatalystInput {
  /** Wikipedia-Pageviews-Spike-Ratio (recent7d / baseline30d). */
  wikiSpike?: number | null;
  /** Google-Trends-Spike-Ratio. */
  trendsSpike?: number | null;
  /** Anzahl Yahoo-News der letzten 7 Tage. */
  recentNewsCount?: number;
  /** Finnhub MSPR-Score (Insider-Sentiment Ø 6M). Positiv = bullish. */
  insiderMspr?: number | null;
  /** Anteil StrongBuy+Buy am gesamten Analyst-Konsens (0..1). */
  bullishAnalystShare?: number | null;
}

export interface CatalystScore {
  catalystScore: number;
  reasons: string[];
}

export function computeCatalystScore(input: CatalystInput): CatalystScore {
  let s = 0;
  const reasons: string[] = [];

  if (typeof input.wikiSpike === "number") {
    if (input.wikiSpike >= 2.0) {
      s += 8;
      reasons.push(`Wiki-Spike ${input.wikiSpike.toFixed(2)}×`);
    } else if (input.wikiSpike >= 1.5) {
      s += 5;
      reasons.push(`Wiki-Aufmerksamkeit erhöht (${input.wikiSpike.toFixed(2)}×)`);
    } else if (input.wikiSpike >= 1.2) {
      s += 2;
    }
  }

  if (typeof input.trendsSpike === "number") {
    if (input.trendsSpike >= 2.0) {
      s += 8;
      reasons.push(`Google-Trends-Spike ${input.trendsSpike.toFixed(2)}×`);
    } else if (input.trendsSpike >= 1.5) {
      s += 5;
      reasons.push(`Suchinteresse erhöht (${input.trendsSpike.toFixed(2)}×)`);
    } else if (input.trendsSpike >= 1.2) {
      s += 2;
    }
  }

  if (input.recentNewsCount && input.recentNewsCount > 0) {
    if (input.recentNewsCount >= 5) {
      s += 4;
      reasons.push(`${input.recentNewsCount} News in 7T`);
    } else if (input.recentNewsCount >= 2) {
      s += 2;
      reasons.push(`${input.recentNewsCount} News in 7T`);
    } else {
      s += 1;
    }
  }

  if (typeof input.insiderMspr === "number") {
    if (input.insiderMspr >= 30) {
      s += 4;
      reasons.push(`Insider bullish (MSPR ${input.insiderMspr.toFixed(0)})`);
    } else if (input.insiderMspr >= 10) {
      s += 2;
    }
  }

  if (typeof input.bullishAnalystShare === "number") {
    if (input.bullishAnalystShare >= 0.7) {
      s += 1;
      reasons.push(
        `Analyst-Konsens ${(input.bullishAnalystShare * 100).toFixed(0)}% bullish`
      );
    }
  }

  return { catalystScore: Math.min(s, 25), reasons };
}
