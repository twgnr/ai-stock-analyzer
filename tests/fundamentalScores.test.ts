import { describe, it, expect } from "vitest";
import {
  computePiotroski,
  computeAltman,
  computeBeneish,
  computeGrahamNumber,
  computeShareholderYield,
} from "@/lib/fundamentalScores";
import type { FinancialRow } from "@/lib/yahoo";

function highQualityYears(): FinancialRow[] {
  // y0 better than y1 on all 9 Piotroski criteria
  const y0: FinancialRow = {
    endDate: "2026-12-31",
    totalRevenue: 120,
    costOfRevenue: 40,
    grossProfit: 80,
    operatingIncome: 30,
    ebit: 30,
    netIncome: 20,
    operatingCashflow: 25,
    totalAssets: 200,
    totalCurrentAssets: 100,
    totalCurrentLiabilities: 40,
    totalLiab: 80,
    longTermDebt: 40,
    retainedEarnings: 60,
    issuanceOfStock: 0,
  };
  const y1: FinancialRow = {
    endDate: "2025-12-31",
    totalRevenue: 100,
    costOfRevenue: 40,
    grossProfit: 60,
    operatingIncome: 15,
    ebit: 15,
    netIncome: 10,
    operatingCashflow: 12,
    totalAssets: 190,
    totalCurrentAssets: 80,
    totalCurrentLiabilities: 40,
    totalLiab: 90,
    longTermDebt: 50,
    retainedEarnings: 40,
    issuanceOfStock: 0,
  };
  return [y0, y1];
}

describe("Piotroski F-Score", () => {
  it("maxes out on pristine year-over-year improvement", () => {
    const p = computePiotroski(highQualityYears());
    expect(p.applicable).toBe(true);
    expect(p.score).toBe(9);
    expect(p.label).toBe("stark");
  });

  it("is 0 when everything is bad", () => {
    const bad: FinancialRow[] = [
      {
        endDate: "2026-12-31",
        totalRevenue: 80,
        grossProfit: 20,
        netIncome: -5,
        operatingCashflow: -2,
        totalAssets: 200,
        totalCurrentAssets: 40,
        totalCurrentLiabilities: 60,
        longTermDebt: 100,
        issuanceOfStock: 50,
      },
      {
        endDate: "2025-12-31",
        totalRevenue: 100,
        grossProfit: 40,
        netIncome: 5,
        operatingCashflow: 6,
        totalAssets: 180,
        totalCurrentAssets: 70,
        totalCurrentLiabilities: 40,
        longTermDebt: 80,
        issuanceOfStock: 0,
      },
    ];
    const p = computePiotroski(bad);
    expect(p.applicable).toBe(true);
    expect(p.score).toBeLessThanOrEqual(2);
  });

  it("not applicable with <2 years", () => {
    const p = computePiotroski([highQualityYears()[0]]);
    expect(p.applicable).toBe(false);
    expect(p.score).toBe(0);
  });
});

describe("Altman Z-Score", () => {
  it("safe zone on strong balance + high market cap", () => {
    const [y0] = highQualityYears();
    const z = computeAltman([y0], 400); // MCap 400
    expect(z.z).not.toBeNull();
    expect(z.zone).toBe("safe");
  });

  it("n/a when key data is missing", () => {
    const z = computeAltman([{ endDate: "2026" } as FinancialRow], 100);
    expect(z.z).toBeNull();
    expect(z.zone).toBe("n/a");
  });
});

describe("Beneish M-Score", () => {
  it("computes and classifies", () => {
    const y: FinancialRow[] = [
      {
        endDate: "2026-12-31",
        totalRevenue: 120,
        costOfRevenue: 60,
        receivables: 30,
        totalAssets: 300,
        totalCurrentAssets: 150,
        totalLiab: 100,
        netPpe: 80,
        netIncome: 10,
        operatingCashflow: 8,
        depreciation: 10,
        sga: 20,
      },
      {
        endDate: "2025-12-31",
        totalRevenue: 100,
        costOfRevenue: 50,
        receivables: 20,
        totalAssets: 260,
        totalCurrentAssets: 130,
        totalLiab: 90,
        netPpe: 70,
        netIncome: 8,
        operatingCashflow: 7,
        depreciation: 9,
        sga: 15,
      },
    ];
    const b = computeBeneish(y);
    expect(b.m).not.toBeNull();
    expect(["likely manipulator", "unlikely manipulator"]).toContain(b.label);
  });
});

describe("Graham Number", () => {
  it("sqrt(22.5 × EPS × BV) when inputs are positive", () => {
    const g = computeGrahamNumber(10, 20, 100);
    // sqrt(22.5 × 10 × 20) = sqrt(4500) ≈ 67.08
    expect(g.grahamNumber).toBeCloseTo(Math.sqrt(4500), 4);
    expect(g.upsideDownsidePct).toBeCloseTo(-32.92, 1); // (67.08 − 100) / 100
  });

  it("rejects non-positive EPS", () => {
    const g = computeGrahamNumber(-1, 10, 100);
    expect(g.grahamNumber).toBeNull();
  });

  it("null when inputs missing", () => {
    const g = computeGrahamNumber(null, 10, 100);
    expect(g.grahamNumber).toBeNull();
  });
});

describe("Shareholder Yield", () => {
  it("sums dividend + buyback + debt-paydown yields", () => {
    const annual: FinancialRow[] = [
      {
        endDate: "2026-12-31",
        repurchaseOfStock: 100,
        issuanceOfStock: 0,
        netIssuanceOfDebt: -50, // Debt-Paydown von 50
      },
    ];
    const s = computeShareholderYield(annual, 10000, 0.03);
    // Div=3%, Buyback=1%, DebtPaydown=0.5% → 4.5%
    expect(s.dividendYieldPct).toBeCloseTo(3, 6);
    expect(s.buybackYieldPct).toBeCloseTo(1, 6);
    expect(s.debtPaydownYieldPct).toBeCloseTo(0.5, 6);
    expect(s.totalShareholderYieldPct).toBeCloseTo(4.5, 6);
  });

  it("returns nulls on missing market-cap", () => {
    const s = computeShareholderYield([], null, null);
    expect(s.totalShareholderYieldPct).toBeNull();
  });
});
