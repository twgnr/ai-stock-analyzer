/**
 * Portfolio-Risiko-Analytik:
 *  - Value-at-Risk (historisch empirisch + parametrisch) + Conditional VaR
 *  - Stress-Test gegen fixierte historische Krisen
 *  - Monte-Carlo-Simulation mit Historical-Bootstrap
 *
 * Alle Funktionen arbeiten auf gewichteten täglichen Portfolio-Returns.
 * Keine Annahmen über eine spezielle Normalverteilung — Bootstrap und
 * empirische Quantile sind robuster gegen die typischen Fat-Tails am
 * Aktienmarkt.
 */

import { stddev } from "./stats";

export interface VarResult {
  confidence: number; // z.B. 0.95
  /** Verlust als positive Zahl (Portfolio-Anteil) */
  varDaily: number;
  varMonthly: number;
  /** Conditional VaR (Expected Shortfall) */
  cvarDaily: number;
  cvarMonthly: number;
  parametricVarDaily: number;
  observations: number;
}

export interface StressScenario {
  key: string;
  label: string;
  /** ISO-Daten, beide inklusiv */
  start: string;
  end: string;
  /** Kurze Beschreibung für UI */
  description: string;
}

export interface StressResult {
  scenario: StressScenario;
  /** Gesamter Portfolio-Return im Szenario (multiplikativ) */
  portfolioReturn: number | null;
  /** Pro-Ticker-Beiträge sortiert absteigend nach Betrag */
  contributions: Array<{ ticker: string; weight: number; tickerReturn: number; contribution: number }>;
  missingTickers: string[];
}

export interface MonteCarloResult {
  paths: number;
  horizonDays: number;
  /** Endwert als Multiplikator des Portfolio-Werts (1.0 = unverändert) */
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  /** Wahrscheinlichkeit, am Ende im Verlust zu stehen */
  probLossEnd: number;
  /** Wahrscheinlichkeit, irgendwann unterwegs > 20% zu verlieren */
  probDrawdownGt20: number;
  /** Wahrscheinlichkeit für Gewinn > 20% am Ende */
  probGainGt20: number;
  meanEnd: number;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    key: "covid-2020",
    label: "COVID-Crash 2020",
    start: "2020-02-19",
    end: "2020-03-23",
    description: "S&P 500 verlor in ca. 5 Wochen rund 34%.",
  },
  {
    key: "gfc-2008",
    label: "Finanzkrise 2008",
    start: "2008-09-01",
    end: "2009-03-09",
    description: "Lehman-Kollaps bis Tief des S&P 500 im März 2009.",
  },
  {
    key: "rate-shock-2022",
    label: "Zinsschock 2022",
    start: "2022-01-03",
    end: "2022-10-12",
    description: "Aggressive Zinsanhebungen, Inflation und Liquiditätssorgen.",
  },
  {
    key: "dotcom-2000",
    label: "Dotcom-Crash 2000/02",
    start: "2000-03-24",
    end: "2002-10-09",
    description: "Platzen der Dotcom-Blase bis zum Tief Ende 2002.",
  },
  {
    key: "china-2015",
    label: "China/Taper-Schock 2015",
    start: "2015-08-10",
    end: "2016-02-11",
    description: "China-Abwertung und Rohstoff-Crash, Zinsangst in den USA.",
  },
];

/**
 * Berechne tägliche Returns aus Close-Daten, behandle Lücken und Dividenden
 * vereinfacht als unverändert (Yahoo liefert adjusted close über den Chart,
 * nicht den rohen Close — Annahme: Quelle ist adjusted).
 */
export function dailyReturnsFromCloses(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) rets.push(b / a - 1);
  }
  return rets;
}

/**
 * Gewichtete tägliche Portfolio-Returns aus einer Map von Ticker → Close-Reihe.
 * Nur Datenpunkte, an denen *alle* Ticker einen Return liefern, fließen ein.
 */
export function weightedPortfolioReturns(
  series: Map<string, { dates: string[]; closes: number[] }>,
  weights: Map<string, number>
): number[] {
  if (series.size === 0) return [];
  const tickers = [...weights.keys()].filter((t) => series.has(t));
  if (tickers.length === 0) return [];

  // Gemeinsame Datumsmenge ermitteln
  const dateSets = tickers.map((t) => new Set(series.get(t)!.dates));
  const commonDates = [...dateSets[0]].filter((d) =>
    dateSets.every((s) => s.has(d))
  );
  commonDates.sort();
  if (commonDates.length < 10) return [];

  // Pro Ticker Close an den gemeinsamen Daten
  const tickerCloses = new Map<string, number[]>();
  for (const t of tickers) {
    const s = series.get(t)!;
    const byDate = new Map<string, number>();
    s.dates.forEach((d, i) => byDate.set(d, s.closes[i]));
    tickerCloses.set(
      t,
      commonDates.map((d) => byDate.get(d) || 0)
    );
  }

  const portReturns: number[] = [];
  for (let i = 1; i < commonDates.length; i++) {
    let r = 0;
    let wSum = 0;
    for (const t of tickers) {
      const closes = tickerCloses.get(t)!;
      const a = closes[i - 1];
      const b = closes[i];
      if (a <= 0 || b <= 0) continue;
      const w = weights.get(t) || 0;
      r += w * (b / a - 1);
      wSum += w;
    }
    if (wSum > 0) portReturns.push(r / wSum);
  }
  return portReturns;
}

export function computeVar(
  returns: number[],
  confidence = 0.95
): VarResult | null {
  if (returns.length < 30) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const quantileIdx = Math.floor((1 - confidence) * sorted.length);
  const varDaily = Math.max(0, -sorted[quantileIdx]);
  const tailLosses = sorted.slice(0, Math.max(1, quantileIdx + 1));
  const cvarDaily = Math.max(
    0,
    -tailLosses.reduce((s, v) => s + v, 0) / tailLosses.length
  );
  const sd = stddev(returns);
  // Normal-VaR: z_95 = 1.645; scaling sqrt(21) → Monats-Approx.
  const z = confidence === 0.99 ? 2.326 : confidence === 0.975 ? 1.96 : 1.645;
  const parametricVarDaily = z * sd;
  const sqrt21 = Math.sqrt(21);

  return {
    confidence,
    varDaily,
    varMonthly: varDaily * sqrt21,
    cvarDaily,
    cvarMonthly: cvarDaily * sqrt21,
    parametricVarDaily,
    observations: returns.length,
  };
}

/**
 * Produkt-Return (b_n / a_0) − 1 aus einer Close-Serie, deren erste
 * Datum ≥ start und letzte ≤ end liegt.
 */
export function windowReturn(
  dates: string[],
  closes: number[],
  start: string,
  end: string
): number | null {
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (startIdx === -1 && dates[i] >= start) startIdx = i;
    if (dates[i] <= end) endIdx = i;
  }
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return null;
  const a = closes[startIdx];
  const b = closes[endIdx];
  if (a <= 0 || b <= 0) return null;
  return b / a - 1;
}

export function runStress(
  series: Map<string, { dates: string[]; closes: number[] }>,
  weights: Map<string, number>
): StressResult[] {
  const results: StressResult[] = [];
  for (const scenario of STRESS_SCENARIOS) {
    const contributions: StressResult["contributions"] = [];
    const missingTickers: string[] = [];
    let weighted = 0;
    let wSum = 0;

    for (const [ticker, weight] of weights) {
      const s = series.get(ticker);
      if (!s) {
        missingTickers.push(ticker);
        continue;
      }
      const r = windowReturn(s.dates, s.closes, scenario.start, scenario.end);
      if (r == null) {
        missingTickers.push(ticker);
        continue;
      }
      const contribution = r * weight;
      contributions.push({ ticker, weight, tickerReturn: r, contribution });
      weighted += contribution;
      wSum += weight;
    }

    const portfolioReturn = wSum > 0 ? weighted / wSum : null;
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    results.push({
      scenario,
      portfolioReturn,
      contributions,
      missingTickers,
    });
  }
  return results;
}

/**
 * Monte-Carlo per Historical-Bootstrap: ziehe zufällig aus beobachteten
 * Tagesreturns, simuliere 1000+ Pfade über horizonDays und aggregiere
 * Perzentile. Robust gegen Normal-Annahme.
 */
export function runMonteCarlo(
  returns: number[],
  horizonDays = 252,
  paths = 1000
): MonteCarloResult | null {
  if (returns.length < 30) return null;
  const endValues: number[] = [];
  let drawdown20Count = 0;
  let sumEnd = 0;

  for (let p = 0; p < paths; p++) {
    let value = 1;
    let peak = 1;
    let hitDrawdown = false;
    for (let d = 0; d < horizonDays; d++) {
      const r = returns[Math.floor(Math.random() * returns.length)];
      value *= 1 + r;
      if (value > peak) peak = value;
      if (!hitDrawdown && value / peak - 1 <= -0.2) hitDrawdown = true;
    }
    if (hitDrawdown) drawdown20Count++;
    endValues.push(value);
    sumEnd += value;
  }

  endValues.sort((a, b) => a - b);
  const pick = (q: number) => endValues[Math.min(endValues.length - 1, Math.floor(q * endValues.length))];
  const lossEndCount = endValues.filter((v) => v < 1).length;
  const gain20Count = endValues.filter((v) => v > 1.2).length;

  return {
    paths,
    horizonDays,
    percentiles: {
      p5: pick(0.05),
      p25: pick(0.25),
      p50: pick(0.5),
      p75: pick(0.75),
      p95: pick(0.95),
    },
    probLossEnd: lossEndCount / paths,
    probDrawdownGt20: drawdown20Count / paths,
    probGainGt20: gain20Count / paths,
    meanEnd: sumEnd / paths,
  };
}
