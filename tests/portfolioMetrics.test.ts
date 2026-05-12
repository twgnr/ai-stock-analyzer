import { describe, it, expect } from "vitest";
import { computePortfolioMetrics } from "@/lib/portfolioMetrics";

function d(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

describe("computePortfolioMetrics", () => {
  it("returns null for < 2 snapshots", () => {
    expect(
      computePortfolioMetrics([
        { date: d("2026-01-01"), totalValueBase: 1000, totalCostBase: 1000 },
      ])
    ).toBeNull();
  });

  it("simple return matches when no flows", () => {
    const m = computePortfolioMetrics([
      { date: d("2026-01-01"), totalValueBase: 1000, totalCostBase: 1000 },
      { date: d("2026-01-02"), totalValueBase: 1100, totalCostBase: 1000 },
    ]);
    expect(m).not.toBeNull();
    if (m) {
      expect(m.simpleReturnPct).toBeCloseTo(10, 6);
      expect(m.twrPct).toBeCloseTo(10, 6);
    }
  });

  it("TWR strips out deposits (equal values after deposit → 0% return)", () => {
    // Tag 1: Wert 1000. Tag 2: Wert 2000 weil 1000 EUR eingezahlt. Echter Return: 0%.
    const m = computePortfolioMetrics(
      [
        { date: d("2026-01-01"), totalValueBase: 1000, totalCostBase: 1000 },
        { date: d("2026-01-02"), totalValueBase: 2000, totalCostBase: 2000 },
      ],
      [{ date: d("2026-01-02"), amountBase: 1000 }]
    );
    expect(m).not.toBeNull();
    if (m) {
      expect(m.twrPct).toBeCloseTo(0, 6);
      // Simple Return wäre dagegen +100% — genau der verzerrende Effekt, den TWR entfernt
      expect(m.simpleReturnPct).toBeCloseTo(100, 6);
    }
  });

  it("max drawdown identifies the largest peak-to-trough loss", () => {
    const m = computePortfolioMetrics([
      { date: d("2026-01-01"), totalValueBase: 1000, totalCostBase: 1000 },
      { date: d("2026-01-02"), totalValueBase: 1200, totalCostBase: 1000 },
      { date: d("2026-01-03"), totalValueBase: 900, totalCostBase: 1000 },
      { date: d("2026-01-04"), totalValueBase: 1100, totalCostBase: 1000 },
    ]);
    expect(m).not.toBeNull();
    if (m) {
      // Peak 1200 → Trough 900 = 25% DD
      expect(m.maxDrawdownPct).toBeCloseTo(25, 1);
    }
  });

  it("monthly returns group by calendar month", () => {
    const m = computePortfolioMetrics([
      { date: d("2026-01-15"), totalValueBase: 1000, totalCostBase: 1000 },
      { date: d("2026-01-31"), totalValueBase: 1050, totalCostBase: 1000 },
      { date: d("2026-02-15"), totalValueBase: 1100, totalCostBase: 1000 },
      { date: d("2026-02-28"), totalValueBase: 1000, totalCostBase: 1000 },
    ]);
    expect(m).not.toBeNull();
    if (m) {
      const jan = m.monthlyReturns.find((x) => x.month === "2026-01");
      const feb = m.monthlyReturns.find((x) => x.month === "2026-02");
      expect(jan?.returnPct).toBeCloseTo(5, 1);
      // Feb: 1000→1100→1000, compound: 1.0476... * 0.909 ≈ 0.952, → -4.8%
      expect(feb?.returnPct).toBeLessThan(0);
    }
  });

  it("sharpe = 0 when there is no volatility", () => {
    const snaps = [];
    for (let i = 0; i < 10; i++) {
      snaps.push({
        date: d(`2026-01-${String(i + 1).padStart(2, "0")}`),
        totalValueBase: 1000,
        totalCostBase: 1000,
      });
    }
    const m = computePortfolioMetrics(snaps);
    expect(m).not.toBeNull();
    if (m) {
      expect(m.sharpe).toBe(0);
      expect(m.sortino).toBe(0);
      expect(m.volatilityPct).toBeCloseTo(0, 6);
    }
  });
});
