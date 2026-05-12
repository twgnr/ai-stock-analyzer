/**
 * Vereinfachte Faktor-Exposure pro Position, Aggregation auf Portfolio-Ebene.
 *
 * Anstatt Fama-French-Regressionen (die sauberes Datenabo bräuchten) bauen
 * wir die Exposure aus direkt beobachtbaren Fundamentals — pro Faktor eine
 * normalisierte 0..100-Skala. Für ein Investment-Tool zur Selbsteinschätzung
 * ist das aussagekräftig; für wissenschaftlich saubere Faktor-Analysen sollte
 * man externe Daten nutzen.
 *
 * Faktoren:
 *  • Value     — niedrig = growth, hoch = value. KGV, KBV invers skaliert.
 *  • Growth    — hoch = wachstumsorientiert. Revenue- & Earnings-Wachstum.
 *  • Size      — hoch = Large-Cap, niedrig = Small-Cap. log(marketCap).
 *  • Quality   — hoch = hohe Margen, niedriges Verschuldungsrisiko. ROE &
 *                operating margin, debt/equity invers.
 *  • Momentum  — hoch = stark über 52W-Tief / nahe 52W-Hoch.
 */

interface FactorInput {
  marketCap?: number;
  peRatio?: number;
  priceToBook?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  profitMargin?: number;
  operatingMargin?: number;
  debtToEquity?: number;
  price?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface FactorScores {
  value: number; // 0..100
  growth: number;
  size: number;
  quality: number;
  momentum: number;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function invScale(v: number | undefined, lo: number, hi: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v <= lo) return 100;
  if (v >= hi) return 0;
  return clamp(100 - ((v - lo) / (hi - lo)) * 100);
}

function linScale(v: number | undefined, lo: number, hi: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v <= lo) return 0;
  if (v >= hi) return 100;
  return clamp(((v - lo) / (hi - lo)) * 100);
}

function avg(vals: Array<number | null>): number {
  const f = vals.filter((v): v is number => v != null);
  if (f.length === 0) return 50; // neutral, wenn Daten fehlen
  return f.reduce((s, v) => s + v, 0) / f.length;
}

export function scorePositionFactors(input: FactorInput): FactorScores {
  // Value: niedriges KGV und KBV → hoch
  const value = avg([
    invScale(input.peRatio, 5, 40),
    invScale(input.priceToBook, 0.5, 8),
  ]);

  // Growth: hohe Umsatz-/Gewinn-Wachstumsraten → hoch
  const growth = avg([
    linScale(input.revenueGrowth ? input.revenueGrowth * 100 : undefined, 0, 30),
    linScale(input.earningsGrowth ? input.earningsGrowth * 100 : undefined, 0, 30),
  ]);

  // Size: log-Marktkapitalisierung, kalibriert 1B bis 2T
  const mc = input.marketCap;
  const sizeScore =
    mc != null && mc > 0
      ? clamp(((Math.log10(mc) - 9) / (Math.log10(2e12) - 9)) * 100)
      : 50;

  // Quality: hohe Marge, niedrige Verschuldung
  const quality = avg([
    linScale(input.operatingMargin ? input.operatingMargin * 100 : undefined, 0, 40),
    linScale(input.profitMargin ? input.profitMargin * 100 : undefined, 0, 30),
    invScale(input.debtToEquity, 0, 200),
  ]);

  // Momentum: wie weit über 52W-Tief / unter 52W-Hoch
  let momentum = 50;
  if (
    input.price != null &&
    input.fiftyTwoWeekHigh != null &&
    input.fiftyTwoWeekLow != null &&
    input.fiftyTwoWeekHigh > input.fiftyTwoWeekLow
  ) {
    const range = input.fiftyTwoWeekHigh - input.fiftyTwoWeekLow;
    momentum = clamp(((input.price - input.fiftyTwoWeekLow) / range) * 100);
  }

  return {
    value: Math.round(value),
    growth: Math.round(growth),
    size: Math.round(sizeScore),
    quality: Math.round(quality),
    momentum: Math.round(momentum),
  };
}

export interface PortfolioFactorAggregate {
  weightedScores: FactorScores;
  tilt: Array<{ factor: keyof FactorScores; label: string; score: number; deviation: number }>;
}

const LABELS: Record<keyof FactorScores, string> = {
  value: "Value",
  growth: "Growth",
  size: "Size (Large-Cap)",
  quality: "Quality",
  momentum: "Momentum",
};

export function aggregatePortfolioFactors(
  positions: Array<{ weight: number; scores: FactorScores }>
): PortfolioFactorAggregate {
  const total = positions.reduce((s, p) => s + p.weight, 0) || 1;
  const weighted: FactorScores = {
    value: 0,
    growth: 0,
    size: 0,
    quality: 0,
    momentum: 0,
  };
  for (const p of positions) {
    const w = p.weight / total;
    weighted.value += p.scores.value * w;
    weighted.growth += p.scores.growth * w;
    weighted.size += p.scores.size * w;
    weighted.quality += p.scores.quality * w;
    weighted.momentum += p.scores.momentum * w;
  }
  // Abweichung von 50 = neutraler Wert
  const tilt = (Object.keys(weighted) as Array<keyof FactorScores>).map((f) => ({
    factor: f,
    label: LABELS[f],
    score: Math.round(weighted[f]),
    deviation: Math.round(weighted[f] - 50),
  }));
  tilt.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  return {
    weightedScores: {
      value: Math.round(weighted.value),
      growth: Math.round(weighted.growth),
      size: Math.round(weighted.size),
      quality: Math.round(weighted.quality),
      momentum: Math.round(weighted.momentum),
    },
    tilt,
  };
}
