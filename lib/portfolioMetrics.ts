/**
 * Portfolio-Metriken auf Basis der täglichen Snapshots + Transaktionen.
 *
 * Time-Weighted Return (TWR): entfernt verzerrende Effekte durch Ein-/Auszahlungen
 * (wichtig, wenn jemand in einem guten Monat nachkauft — der Simple-Return würde
 * den Kauf als „Gewinn" fehlinterpretieren). Wir chainen sub-period returns
 *   r_i = (V_i - flow_i) / V_{i-1}  -  1
 * TWR = prod(1 + r_i) - 1
 *
 * Sharpe: annualisierte überschussrendite / annualisierte Volatilität.
 * Sortino: wie Sharpe, aber nur Downside-Deviation im Nenner.
 * Max-Drawdown: max Peak-to-Trough-Verlust in Prozent.
 */

export interface SnapshotPoint {
  date: Date;
  totalValueBase: number;
  totalCostBase: number;
}

export interface FlowPoint {
  date: Date;
  amountBase: number; // Einzahlung positiv, Verkauf/Auszahlung negativ
}

export interface MetricsResult {
  twrPct: number;
  twrAnnualizedPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownStart?: Date;
  maxDrawdownEnd?: Date;
  volatilityPct: number;
  downsideVolatilityPct: number;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  dataPoints: number;
  // Einfacher Simple-Return zur Gegenüberstellung
  simpleReturnPct: number;
  // Monthly returns (für Heatmap): key = YYYY-MM, value = monatl. TWR %
  monthlyReturns: Array<{ month: string; returnPct: number }>;
}

const TRADING_DAYS_PER_YEAR = 252;

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[], m?: number): number {
  if (xs.length < 2) return 0;
  const avg = m ?? mean(xs);
  const v = xs.reduce((s, x) => s + (x - avg) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function downsideStddev(xs: number[], mar = 0): number {
  // nur negative Abweichungen von der Minimum Acceptable Return (MAR)
  const neg = xs.filter((x) => x < mar);
  if (neg.length < 2) return 0;
  const v = neg.reduce((s, x) => s + (x - mar) ** 2, 0) / (neg.length - 1);
  return Math.sqrt(v);
}

export function computePortfolioMetrics(
  snapshots: SnapshotPoint[],
  flows: FlowPoint[] = [],
  riskFreeRateAnnual = 0
): MetricsResult | null {
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < 2) return null;

  // Flows nach YYYY-MM-DD gruppieren, summieren
  const flowByDay = new Map<string, number>();
  for (const f of flows) {
    const key = f.date.toISOString().slice(0, 10);
    flowByDay.set(key, (flowByDay.get(key) || 0) + f.amountBase);
  }

  // Sub-period returns zwischen aufeinanderfolgenden Snapshots
  const dailyReturns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].totalValueBase;
    const cur = sorted[i].totalValueBase;
    if (prev <= 0) continue;
    const key = sorted[i].date.toISOString().slice(0, 10);
    const flow = flowByDay.get(key) || 0;
    // Adjustiert: der Teil der Wertänderung, der NICHT durch Einzahlung kam
    const r = (cur - flow) / prev - 1;
    if (Number.isFinite(r)) dailyReturns.push(r);
  }

  if (dailyReturns.length === 0) return null;

  // TWR = prod(1+r) - 1
  const compound = dailyReturns.reduce((acc, r) => acc * (1 + r), 1);
  const twr = compound - 1;

  const startDate = sorted[0].date;
  const endDate = sorted[sorted.length - 1].date;
  const totalDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const years = totalDays / 365.25;
  const twrAnnualized = years > 0 ? Math.pow(1 + twr, 1 / years) - 1 : twr;

  // Sharpe / Sortino: daily returns → annualisieren mit √252
  const rfDaily = riskFreeRateAnnual / TRADING_DAYS_PER_YEAR;
  const excess = dailyReturns.map((r) => r - rfDaily);
  const meanExcess = mean(excess);
  const sd = stddev(dailyReturns);
  const dsd = downsideStddev(dailyReturns, rfDaily);
  const sharpe = sd > 0 ? (meanExcess * TRADING_DAYS_PER_YEAR) / (sd * Math.sqrt(TRADING_DAYS_PER_YEAR)) : 0;
  const sortino = dsd > 0 ? (meanExcess * TRADING_DAYS_PER_YEAR) / (dsd * Math.sqrt(TRADING_DAYS_PER_YEAR)) : 0;

  // Max-Drawdown auf Equity-Curve (ohne Flow-Adjustierung, bewusst)
  let peak = sorted[0].totalValueBase;
  let peakDate = sorted[0].date;
  let maxDD = 0;
  let maxDDAmount = 0;
  let maxDDStart: Date | undefined;
  let maxDDEnd: Date | undefined;
  for (const s of sorted) {
    if (s.totalValueBase > peak) {
      peak = s.totalValueBase;
      peakDate = s.date;
    }
    const ddAmount = peak - s.totalValueBase;
    const dd = peak > 0 ? ddAmount / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDAmount = ddAmount;
      maxDDStart = peakDate;
      maxDDEnd = s.date;
    }
  }

  // Simple Return (Sanity-Check)
  const simple =
    sorted[0].totalValueBase > 0
      ? (sorted[sorted.length - 1].totalValueBase - sorted[0].totalValueBase) /
        sorted[0].totalValueBase
      : 0;

  // Monthly TWRs: pro Kalendermonat chainen
  const monthlyBuckets = new Map<string, number[]>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].totalValueBase;
    const cur = sorted[i].totalValueBase;
    if (prev <= 0) continue;
    const key = sorted[i].date.toISOString().slice(0, 10);
    const flow = flowByDay.get(key) || 0;
    const r = (cur - flow) / prev - 1;
    if (!Number.isFinite(r)) continue;
    const m = ymKey(sorted[i].date);
    if (!monthlyBuckets.has(m)) monthlyBuckets.set(m, []);
    monthlyBuckets.get(m)!.push(r);
  }
  const monthlyReturns = [...monthlyBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, rs]) => ({
      month,
      returnPct: (rs.reduce((acc, r) => acc * (1 + r), 1) - 1) * 100,
    }));

  return {
    twrPct: twr * 100,
    twrAnnualizedPct: twrAnnualized * 100,
    sharpe,
    sortino,
    maxDrawdownPct: maxDD * 100,
    maxDrawdownAmount: maxDDAmount,
    maxDrawdownStart: maxDDStart,
    maxDrawdownEnd: maxDDEnd,
    volatilityPct: sd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    downsideVolatilityPct: dsd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    startDate,
    endDate,
    totalDays,
    dataPoints: sorted.length,
    simpleReturnPct: simple * 100,
    monthlyReturns,
  };
}
