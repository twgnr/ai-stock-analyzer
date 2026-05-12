import {
  computeRSI,
  computeSMA,
  computeMACD,
  computeBollingerBands,
} from "./chartIndicators";

export type StrategyKey =
  | "rsi-30-70"
  | "sma-20-50-cross"
  | "sma-50-200-cross"
  | "macd-cross"
  | "bollinger-breakout"
  | "buy-hold";

export interface StrategyMeta {
  key: StrategyKey;
  label: string;
  description: string;
}

export const STRATEGIES: StrategyMeta[] = [
  {
    key: "rsi-30-70",
    label: "RSI 30/70",
    description: "Kauf wenn RSI(14) unter 30, Verkauf wenn über 70.",
  },
  {
    key: "sma-20-50-cross",
    label: "SMA 20/50 Crossover",
    description: "Kauf wenn SMA20 über SMA50 kreuzt, Verkauf wenn SMA20 unter SMA50.",
  },
  {
    key: "sma-50-200-cross",
    label: "Golden/Death Cross (SMA 50/200)",
    description: "Kauf beim Golden Cross (SMA50 > SMA200), Verkauf beim Death Cross.",
  },
  {
    key: "macd-cross",
    label: "MACD-Signal-Crossover",
    description: "Kauf wenn MACD-Linie über Signal-Linie, Verkauf wenn darunter.",
  },
  {
    key: "bollinger-breakout",
    label: "Bollinger-Breakout",
    description: "Kauf bei Close über oberem Band, Verkauf bei Close unter unterem Band.",
  },
  {
    key: "buy-hold",
    label: "Buy & Hold",
    description: "Kauf am ersten Tag, Halten bis Ende — Baseline-Vergleich.",
  },
];

export interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestResult {
  strategy: StrategyKey;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  buyHoldReturnPct: number;
  trades: BacktestTrade[];
  winCount: number;
  lossCount: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  equityCurve: EquityPoint[];
  candleCount: number;
}

interface Signal {
  action: "buy" | "sell" | null;
  reason: string;
}

type SignalFn = (i: number, candles: BacktestCandle[]) => Signal;

function buildSignalFunction(strategy: StrategyKey, candles: BacktestCandle[]): SignalFn {
  const closes = candles.map((c) => c.close);

  if (strategy === "rsi-30-70") {
    const rsi = computeRSI(closes, 14);
    return (i) => {
      const cur = rsi[i];
      const prev = rsi[i - 1];
      if (cur == null || prev == null) return { action: null, reason: "" };
      if (prev >= 30 && cur < 30) return { action: "buy", reason: "RSI <30" };
      if (prev <= 70 && cur > 70) return { action: "sell", reason: "RSI >70" };
      return { action: null, reason: "" };
    };
  }

  if (strategy === "sma-20-50-cross" || strategy === "sma-50-200-cross") {
    const [fast, slow] = strategy === "sma-20-50-cross" ? [20, 50] : [50, 200];
    const smaFast = computeSMA(closes, fast);
    const smaSlow = computeSMA(closes, slow);
    return (i) => {
      const f = smaFast[i];
      const s = smaSlow[i];
      const fp = smaFast[i - 1];
      const sp = smaSlow[i - 1];
      if (f == null || s == null || fp == null || sp == null)
        return { action: null, reason: "" };
      if (fp <= sp && f > s)
        return { action: "buy", reason: `SMA${fast} kreuzt über SMA${slow}` };
      if (fp >= sp && f < s)
        return { action: "sell", reason: `SMA${fast} kreuzt unter SMA${slow}` };
      return { action: null, reason: "" };
    };
  }

  if (strategy === "macd-cross") {
    const m = computeMACD(closes);
    return (i) => {
      const macd = m.macd[i];
      const sig = m.signal[i];
      const mp = m.macd[i - 1];
      const sp = m.signal[i - 1];
      if (macd == null || sig == null || mp == null || sp == null)
        return { action: null, reason: "" };
      if (mp <= sp && macd > sig)
        return { action: "buy", reason: "MACD kreuzt über Signal" };
      if (mp >= sp && macd < sig)
        return { action: "sell", reason: "MACD kreuzt unter Signal" };
      return { action: null, reason: "" };
    };
  }

  if (strategy === "bollinger-breakout") {
    const bb = computeBollingerBands(closes);
    return (i) => {
      const u = bb.upper[i];
      const l = bb.lower[i];
      if (u == null || l == null) return { action: null, reason: "" };
      if (closes[i] > u) return { action: "buy", reason: "Close > Upper Band" };
      if (closes[i] < l) return { action: "sell", reason: "Close < Lower Band" };
      return { action: null, reason: "" };
    };
  }

  if (strategy === "buy-hold") {
    return (i) => {
      if (i === 0) return { action: "buy", reason: "Initial" };
      return { action: null, reason: "" };
    };
  }

  return () => ({ action: null, reason: "" });
}

export function runBacktest(
  candles: BacktestCandle[],
  strategy: StrategyKey,
  initialCapital = 10000
): BacktestResult {
  if (candles.length < 30) {
    throw new Error("Zu wenig Candles für Backtest (min. 30).");
  }

  const signal = buildSignalFunction(strategy, candles);
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let peakEquity = initialCapital;
  let maxDrawdownPct = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const sig = signal(i, candles);

    if (sig.action === "buy" && shares === 0) {
      const s = cash / c.close;
      shares = s;
      cash = 0;
      entryPrice = c.close;
      entryTime = c.time;
    } else if (sig.action === "sell" && shares > 0) {
      const value = shares * c.close;
      const pnl = value - shares * entryPrice;
      const pnlPct = ((c.close - entryPrice) / entryPrice) * 100;
      trades.push({
        entryTime,
        entryPrice,
        exitTime: c.time,
        exitPrice: c.close,
        shares,
        pnl,
        pnlPct,
        reason: sig.reason,
      });
      cash = value;
      shares = 0;
    }

    const equity = shares > 0 ? shares * c.close : cash;
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    equityCurve.push({ time: c.time, equity });
  }

  if (shares > 0) {
    const last = candles[candles.length - 1];
    const value = shares * last.close;
    trades.push({
      entryTime,
      entryPrice,
      exitTime: last.time,
      exitPrice: last.close,
      shares,
      pnl: value - shares * entryPrice,
      pnlPct: ((last.close - entryPrice) / entryPrice) * 100,
      reason: "Ende Backtest",
    });
    cash = value;
    shares = 0;
  }

  const finalEquity = cash;
  const totalReturn = finalEquity - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  const first = candles[0];
  const last = candles[candles.length - 1];
  const buyHoldReturnPct = ((last.close - first.close) / first.close) * 100;

  const wins = trades.filter((t) => t.pnl >= 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const winRatePct = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWinPct =
    wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;

  return {
    strategy,
    initialCapital,
    finalEquity,
    totalReturn,
    totalReturnPct,
    buyHoldReturnPct,
    trades,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct,
    avgWinPct,
    avgLossPct,
    maxDrawdownPct,
    equityCurve,
    candleCount: candles.length,
  };
}
