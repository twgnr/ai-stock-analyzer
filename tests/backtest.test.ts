import { describe, it, expect } from "vitest";
import { runBacktest, STRATEGIES } from "@/lib/backtest";

function makeCandles(closes: number[], startTime = 1700000000): Array<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}> {
  return closes.map((c, i) => ({
    time: startTime + i * 86400,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
  }));
}

describe("Backtest / buy-hold baseline", () => {
  it("final equity reflects full price change", () => {
    const closes = [100, 105, 110, 120];
    const candles = makeCandles(closes);
    const r = runBacktest(
      [
        ...Array(30)
          .fill(0)
          .map((_, i) => ({
            time: 1690000000 + i * 86400,
            open: 100,
            high: 101,
            low: 99,
            close: 100,
          })),
        ...candles,
      ],
      "buy-hold",
      10000
    );
    // Kauf am Tag 0 bei 100, Schluss bei 120 → +20%
    expect(r.finalEquity).toBeCloseTo(12000, 1);
    expect(r.totalReturnPct).toBeCloseTo(20, 1);
    expect(r.buyHoldReturnPct).toBeCloseTo(20, 1);
    expect(r.trades).toHaveLength(1);
  });
});

describe("Backtest / throws if too little data", () => {
  it("rejects with < 30 candles", () => {
    const candles = makeCandles([100, 101, 102]);
    expect(() => runBacktest(candles, "rsi-30-70", 10000)).toThrow();
  });
});

describe("Backtest / strategies catalog", () => {
  it("exposes all expected strategies", () => {
    const keys = STRATEGIES.map((s) => s.key).sort();
    expect(keys).toEqual(
      [
        "bollinger-breakout",
        "buy-hold",
        "macd-cross",
        "rsi-30-70",
        "sma-20-50-cross",
        "sma-50-200-cross",
      ].sort()
    );
  });
});

describe("Backtest / drawdown tracking", () => {
  it("max drawdown is >= 0 and <= 100 for any sequence", () => {
    const closes: number[] = [];
    // Wilde Kurse — 100 Punkte, Sinus mit Trend
    for (let i = 0; i < 100; i++) {
      closes.push(100 + 10 * Math.sin(i / 5) + i * 0.1);
    }
    const candles = makeCandles(closes);
    const r = runBacktest(candles, "rsi-30-70", 10000);
    expect(r.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(r.maxDrawdownPct).toBeLessThanOrEqual(100);
  });
});

describe("Backtest / win/loss counters sum to trades.length", () => {
  it("consistent accounting", () => {
    const closes: number[] = [];
    for (let i = 0; i < 80; i++) closes.push(100 + 5 * Math.sin(i / 3));
    const candles = makeCandles(closes);
    const r = runBacktest(candles, "sma-20-50-cross", 10000);
    expect(r.winCount + r.lossCount).toBe(r.trades.length);
  });
});
