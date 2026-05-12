export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  let sum = 0;
  for (const v of slice) sum += v;
  return sum / period;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  variance /= values.length;
  return Math.sqrt(variance);
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  if (closes.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  if (trs.length < period) return null;
  let avg = 0;
  for (let i = 0; i < period; i++) avg += trs[i];
  avg /= period;
  for (let i = period; i < trs.length; i++) {
    avg = (avg * (period - 1) + trs[i]) / period;
  }
  return avg;
}

export function bollingerBandwidth(closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const m = sma(slice, period);
  if (m == null || m === 0) return null;
  const sd = stdev(slice);
  return (4 * sd) / m;
}

export function avgVolume(volumes: number[], period: number): number | null {
  if (volumes.length < period) return null;
  const slice = volumes.slice(-period);
  let sum = 0;
  for (const v of slice) sum += v;
  return sum / period;
}
