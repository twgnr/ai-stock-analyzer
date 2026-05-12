export type IndicatorKey =
  | "SMA20"
  | "SMA50"
  | "SMA200"
  | "BB"
  | "IKH"
  | "RSL"
  | "RSI"
  | "MACD"
  | "AOS"
  | "ARO"
  | "CCI"
  | "MOM"
  | "OBOS"
  | "DIX"
  | "FSTOC"
  | "AVWAP"
  | "OBV"
  | "MFI";

export interface IndicatorMeta {
  key: IndicatorKey;
  abbrev: string;
  label: string;
  category: "Oscillator" | "Trendfolge" | "Gleitender Durchschnitt";
  overlay: boolean;
  description: string;
}

export const INDICATORS: IndicatorMeta[] = [
  { key: "SMA20", abbrev: "SMA 20", label: "Gleitender Durchschnitt 20", category: "Gleitender Durchschnitt", overlay: true, description: "20-Tage SMA" },
  { key: "SMA50", abbrev: "SMA 50", label: "Gleitender Durchschnitt 50", category: "Gleitender Durchschnitt", overlay: true, description: "50-Tage SMA" },
  { key: "SMA200", abbrev: "SMA 200", label: "Gleitender Durchschnitt 200", category: "Gleitender Durchschnitt", overlay: true, description: "200-Tage SMA" },

  { key: "BB", abbrev: "BB", label: "Bollinger Bands", category: "Trendfolge", overlay: true, description: "SMA20 ± 2σ — Volatilitäts-Bänder" },
  { key: "IKH", abbrev: "IKH", label: "Ichimoku Kinko Hyo", category: "Trendfolge", overlay: true, description: "Tenkan (9), Kijun (26), Senkou A/B (Cloud)" },
  { key: "CCI", abbrev: "CCI", label: "Commodity Channel Index", category: "Trendfolge", overlay: false, description: "Mean Deviation um Typical Price (20)" },
  { key: "MACD", abbrev: "MACD", label: "Moving Average Convergence Divergence", category: "Trendfolge", overlay: false, description: "EMA12 − EMA26, Signal EMA9" },
  { key: "RSL", abbrev: "RSL", label: "Relative Stärke (Levy)", category: "Trendfolge", overlay: false, description: "Close / SMA130 — Werte > 1 = stark" },

  { key: "RSI", abbrev: "RSI", label: "Relative Strength Index", category: "Oscillator", overlay: false, description: "0-100, >70 überkauft, <30 überverkauft" },
  { key: "AOS", abbrev: "AOS", label: "Awesome Oscillator", category: "Oscillator", overlay: false, description: "SMA5 − SMA34 des Median-Preises" },
  { key: "ARO", abbrev: "ARO", label: "Aroon Oscillator", category: "Oscillator", overlay: false, description: "AroonUp − AroonDown (Period 14)" },
  { key: "DIX", abbrev: "DI+/−", label: "Directional Index (DI+/DI−)", category: "Oscillator", overlay: false, description: "Richtungsindikatoren (14), Teil des ADX-Systems" },
  { key: "FSTOC", abbrev: "FSTOC", label: "Fast Stochastic", category: "Oscillator", overlay: false, description: "%K (14) und %D (3)" },
  { key: "MOM", abbrev: "MOM", label: "Momentum", category: "Oscillator", overlay: false, description: "Close − Close 10 Perioden zuvor" },
  { key: "OBOS", abbrev: "OBOS", label: "Overbought / Oversold", category: "Oscillator", overlay: false, description: "Abweichung vom SMA20 in %" },
  { key: "MFI", abbrev: "MFI", label: "Money Flow Index", category: "Oscillator", overlay: false, description: "Volumengewichteter RSI (14) — 0-100" },

  { key: "AVWAP", abbrev: "AVWAP", label: "Anchored VWAP", category: "Trendfolge", overlay: true, description: "Volumengewichteter Durchschnittspreis ab sichtbarem Chart-Start" },
  { key: "OBV", abbrev: "OBV", label: "On-Balance Volume", category: "Trendfolge", overlay: false, description: "Kumulatives signiertes Volumen (Joseph Granville)" },
];

export interface OhlcvArrays {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) {
        prev = sum / period;
        result[i] = prev;
      }
    } else {
      prev = values[i] * k + (prev as number) * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

export function computeSMA(closes: number[], period: number) {
  return sma(closes, period);
}

export function computeBollingerBands(closes: number[], period = 20, stdDev = 2) {
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) continue;
    const m = middle[i] as number;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - m) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = m + stdDev * std;
    lower[i] = m - stdDev * std;
  }
  return { upper, middle, lower };
}

export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function computeMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null
  );
  const validMacd = macdLine.filter((v): v is number => v !== null);
  const signalValid = ema(validMacd, signal);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  let vi = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalValid[vi];
      vi++;
    }
  }
  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v !== null && signalLine[i] !== null ? v - (signalLine[i] as number) : null
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

export function computeAwesomeOscillator(highs: number[], lows: number[]) {
  const mid = highs.map((h, i) => (h + lows[i]) / 2);
  const s5 = sma(mid, 5);
  const s34 = sma(mid, 34);
  return s5.map((v, i) => (v !== null && s34[i] !== null ? v - (s34[i] as number) : null));
}

export function computeAroon(highs: number[], lows: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(highs.length).fill(null);
  for (let i = period; i < highs.length; i++) {
    let hIdx = i, lIdx = i;
    for (let j = i - period; j <= i; j++) {
      if (highs[j] > highs[hIdx]) hIdx = j;
      if (lows[j] < lows[lIdx]) lIdx = j;
    }
    const up = ((period - (i - hIdx)) / period) * 100;
    const down = ((period - (i - lIdx)) / period) * 100;
    result[i] = up - down;
  }
  return result;
}

export function computeCCI(highs: number[], lows: number[], closes: number[], period = 20) {
  const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
  const smaTp = sma(tp, period);
  const result: (number | null)[] = new Array(tp.length).fill(null);
  for (let i = period - 1; i < tp.length; i++) {
    const mean = smaTp[i] as number;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - mean);
    dev /= period;
    result[i] = dev === 0 ? 0 : (tp[i] - mean) / (0.015 * dev);
  }
  return result;
}

export function computeMomentum(closes: number[], period = 10): (number | null)[] {
  return closes.map((c, i) => (i < period ? null : c - closes[i - period]));
}

export function computeOBOS(closes: number[], period = 20): (number | null)[] {
  const s = sma(closes, period);
  return closes.map((c, i) =>
    s[i] === null ? null : ((c - (s[i] as number)) / (s[i] as number)) * 100
  );
}

export function computeDI(highs: number[], lows: number[], closes: number[], period = 14) {
  const n = highs.length;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  const plus: (number | null)[] = new Array(n).fill(null);
  const minus: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return { plusDI: plus, minusDI: minus };
  let pdm = 0, mdm = 0, tri = 0;
  for (let i = 1; i <= period; i++) {
    pdm += plusDM[i]; mdm += minusDM[i]; tri += tr[i];
  }
  plus[period] = tri === 0 ? 0 : (pdm / tri) * 100;
  minus[period] = tri === 0 ? 0 : (mdm / tri) * 100;
  for (let i = period + 1; i < n; i++) {
    pdm = pdm - pdm / period + plusDM[i];
    mdm = mdm - mdm / period + minusDM[i];
    tri = tri - tri / period + tr[i];
    plus[i] = tri === 0 ? 0 : (pdm / tri) * 100;
    minus[i] = tri === 0 ? 0 : (mdm / tri) * 100;
  }
  return { plusDI: plus, minusDI: minus };
}

export function computeFastStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
  smoothingD = 3
) {
  const k: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let lo = lows[i], hi = highs[i];
    for (let j = i - period + 1; j <= i; j++) {
      if (lows[j] < lo) lo = lows[j];
      if (highs[j] > hi) hi = highs[j];
    }
    k[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
  }
  const valid = k.filter((v): v is number => v !== null);
  const smoothed = sma(valid, smoothingD);
  const d: (number | null)[] = new Array(closes.length).fill(null);
  let vi = 0;
  for (let i = 0; i < closes.length; i++) {
    if (k[i] !== null) {
      d[i] = smoothed[vi];
      vi++;
    }
  }
  return { k, d };
}

export function computeIchimoku(highs: number[], lows: number[]) {
  const n = highs.length;
  const conv: (number | null)[] = new Array(n).fill(null);
  const base: (number | null)[] = new Array(n).fill(null);
  const spanA: (number | null)[] = new Array(n).fill(null);
  const spanB: (number | null)[] = new Array(n).fill(null);
  const periodHigh = (period: number, idx: number) => {
    let max = -Infinity;
    for (let j = Math.max(0, idx - period + 1); j <= idx; j++)
      if (highs[j] > max) max = highs[j];
    return max;
  };
  const periodLow = (period: number, idx: number) => {
    let min = Infinity;
    for (let j = Math.max(0, idx - period + 1); j <= idx; j++)
      if (lows[j] < min) min = lows[j];
    return min;
  };
  for (let i = 0; i < n; i++) {
    if (i >= 8) conv[i] = (periodHigh(9, i) + periodLow(9, i)) / 2;
    if (i >= 25) base[i] = (periodHigh(26, i) + periodLow(26, i)) / 2;
    if (conv[i] !== null && base[i] !== null)
      spanA[i] = ((conv[i] as number) + (base[i] as number)) / 2;
    if (i >= 51) spanB[i] = (periodHigh(52, i) + periodLow(52, i)) / 2;
  }
  return { conv, base, spanA, spanB };
}

export function computeRSL(closes: number[], period = 130): (number | null)[] {
  const s = sma(closes, period);
  return closes.map((c, i) => (s[i] === null || s[i] === 0 ? null : c / (s[i] as number)));
}

/**
 * Anchored VWAP — kumulatives VWAP ab einem Anker-Index.
 * Typical Price = (H+L+C)/3; VWAP = Σ(TP × V) / Σ V (ab Anker).
 * Werte vor dem Anker sind null.
 */
export function computeAnchoredVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  anchorIndex = 0
): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i++) {
    if (i < anchorIndex) continue;
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] > 0 ? volumes[i] : 0;
    cumPV += tp * v;
    cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

/**
 * On-Balance Volume — kumulative signierte Volume-Summe.
 * +V wenn close > prev, -V wenn close < prev, 0 sonst.
 */
export function computeOBV(closes: number[], volumes: number[]): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;
  let obv = 0;
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    const v = volumes[i] > 0 ? volumes[i] : 0;
    if (closes[i] > closes[i - 1]) obv += v;
    else if (closes[i] < closes[i - 1]) obv -= v;
    out[i] = obv;
  }
  return out;
}

/**
 * Money Flow Index — volumen-gewichteter RSI.
 * Typical Price = (H+L+C)/3. Money Flow = TP × V.
 * Positive-MF summiert bei TP > prev-TP, negative sonst.
 * MFI = 100 − 100 / (1 + posMF/negMF) über `period` Perioden.
 */
export function computeMFI(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period = 14
): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tp: number[] = closes.map((_, i) => (highs[i] + lows[i] + closes[i]) / 3);
  const pos: number[] = new Array(n).fill(0);
  const neg: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const mf = tp[i] * (volumes[i] > 0 ? volumes[i] : 0);
    if (tp[i] > tp[i - 1]) pos[i] = mf;
    else if (tp[i] < tp[i - 1]) neg[i] = mf;
  }
  for (let i = period; i < n; i++) {
    let p = 0;
    let ng = 0;
    for (let k = i - period + 1; k <= i; k++) {
      p += pos[k];
      ng += neg[k];
    }
    if (ng === 0) {
      out[i] = 100;
    } else {
      const mr = p / ng;
      out[i] = 100 - 100 / (1 + mr);
    }
  }
  return out;
}
