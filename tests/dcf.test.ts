import { describe, it, expect } from "vitest";
import { runDcf, runReverseDcf } from "@/lib/dcf";

describe("DCF", () => {
  it("prices 10% growth + 2% terminal + 9% WACC plausibly", () => {
    const r = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 10,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    expect(r.fairValuePerShare).toBeGreaterThan(0);
    expect(r.breakdown).toHaveLength(10);
    expect(r.terminalValue).toBeGreaterThan(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("warns when WACC ≤ terminal growth", () => {
    const r = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 5,
      terminalGrowthPct: 10,
      waccPct: 9,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("higher growth → higher fair value", () => {
    const low = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 2,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    const high = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 10,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    expect(high.fairValuePerShare).toBeGreaterThan(low.fairValuePerShare);
  });

  it("net-debt reduces equity value 1:1", () => {
    const noDebt = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 5,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    const withDebt = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 1000,
      years: 10,
      initialGrowthPct: 5,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    expect(noDebt.equityValue - withDebt.equityValue).toBeCloseTo(1000, 6);
  });
});

describe("Reverse DCF", () => {
  it("recovers the growth rate that produced a given fair value", () => {
    // Run DCF at 7% → get fair value → feed back as price → expect ~7%
    const forward = runDcf({
      initialFcf: 100,
      sharesOutstanding: 100,
      netDebt: 0,
      years: 10,
      initialGrowthPct: 7,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    const rev = runReverseDcf({
      currentPrice: forward.fairValuePerShare,
      sharesOutstanding: 100,
      netDebt: 0,
      initialFcf: 100,
      years: 10,
      terminalGrowthPct: 2,
      waccPct: 9,
    });
    expect(rev.impliedGrowthPct).not.toBeNull();
    if (rev.impliedGrowthPct != null) {
      expect(Math.abs(rev.impliedGrowthPct - 7)).toBeLessThan(0.2);
    }
  });
});
