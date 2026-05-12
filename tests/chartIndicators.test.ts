import { describe, it, expect } from "vitest";
import {
  computeSMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeMomentum,
  computeOBOS,
  computeRSL,
  computeDI,
  computeFastStochastic,
  computeIchimoku,
  computeAnchoredVWAP,
  computeOBV,
  computeMFI,
} from "@/lib/chartIndicators";

function range(n: number, start = 0, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

describe("SMA", () => {
  it("is null until enough data points", () => {
    const s = computeSMA([1, 2, 3, 4, 5], 3);
    expect(s[0]).toBeNull();
    expect(s[1]).toBeNull();
    expect(s[2]).toBe(2); // (1+2+3)/3
    expect(s[3]).toBe(3); // (2+3+4)/3
    expect(s[4]).toBe(4); // (3+4+5)/3
  });
  it("handles period longer than series", () => {
    const s = computeSMA([1, 2, 3], 10);
    expect(s.every((v) => v === null)).toBe(true);
  });
});

describe("Bollinger Bands", () => {
  it("yields middle == SMA20 and symmetric bands", () => {
    const closes = range(30, 100, 1);
    const bb = computeBollingerBands(closes, 20, 2);
    const last = bb.middle[closes.length - 1];
    const up = bb.upper[closes.length - 1];
    const lo = bb.lower[closes.length - 1];
    expect(last).not.toBeNull();
    expect(up).not.toBeNull();
    expect(lo).not.toBeNull();
    if (last != null && up != null && lo != null) {
      expect(up - last).toBeCloseTo(last - lo, 6);
    }
  });
});

describe("RSI", () => {
  it("is near 100 for purely rising series", () => {
    const closes = range(50, 100, 1);
    const rsi = computeRSI(closes, 14);
    const last = rsi[rsi.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(last).toBeGreaterThan(90);
  });
  it("is near 0 for purely falling series", () => {
    const closes = range(50, 150, -1);
    const rsi = computeRSI(closes, 14);
    const last = rsi[rsi.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(last).toBeLessThan(10);
  });
});

describe("MACD", () => {
  it("returns three arrays of equal length", () => {
    const closes = range(100, 100, 1);
    const m = computeMACD(closes);
    expect(m.macd).toHaveLength(closes.length);
    expect(m.signal).toHaveLength(closes.length);
    expect(m.histogram).toHaveLength(closes.length);
  });
});

describe("Momentum", () => {
  it("is close * (1/1) - 1 for constant series = 0", () => {
    const closes = Array(20).fill(100);
    const m = computeMomentum(closes, 10);
    const last = m[m.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(Math.abs(last)).toBeLessThan(1e-6);
  });
});

describe("OBOS", () => {
  it("is ~0 when price equals SMA", () => {
    const closes = Array(30).fill(100);
    const o = computeOBOS(closes);
    const last = o[o.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(Math.abs(last)).toBeLessThan(1e-6);
  });
});

describe("RSL (Levy)", () => {
  it("returns a value once enough data is present", () => {
    const closes = range(200, 100, 0.5);
    const r = computeRSL(closes, 130);
    const last = r[r.length - 1];
    expect(last).not.toBeNull();
  });
});

describe("DI ±", () => {
  it("produces two arrays of equal length", () => {
    const n = 50;
    const highs = range(n, 110, 1);
    const lows = range(n, 100, 1);
    const closes = range(n, 105, 1);
    const di = computeDI(highs, lows, closes);
    expect(di.plusDI).toHaveLength(n);
    expect(di.minusDI).toHaveLength(n);
  });
});

describe("Fast Stochastic", () => {
  it("produces k and d arrays", () => {
    const n = 30;
    const highs = range(n, 110, 1);
    const lows = range(n, 100, 1);
    const closes = range(n, 105, 1);
    const st = computeFastStochastic(highs, lows, closes);
    expect(st.k).toHaveLength(n);
    expect(st.d).toHaveLength(n);
  });
});

describe("Anchored VWAP", () => {
  it("equals running volume-weighted average of typical price", () => {
    // Simpler Case: alle H=L=C=p, volume=v → AVWAP = Σ(p·v)/Σv
    const closes = [100, 110, 120];
    const vols = [100, 200, 300];
    const avwap = computeAnchoredVWAP(closes, closes, closes, vols, 0);
    expect(avwap[0]).toBeCloseTo(100, 6);
    expect(avwap[1]).toBeCloseTo(
      (100 * 100 + 110 * 200) / (100 + 200),
      6
    );
    expect(avwap[2]).toBeCloseTo(
      (100 * 100 + 110 * 200 + 120 * 300) / (100 + 200 + 300),
      6
    );
  });

  it("pre-anchor values are null", () => {
    const avwap = computeAnchoredVWAP([100, 110, 120], [100, 110, 120], [100, 110, 120], [10, 20, 30], 1);
    expect(avwap[0]).toBeNull();
    expect(avwap[1]).not.toBeNull();
  });
});

describe("OBV", () => {
  it("accumulates volume by sign of close-delta", () => {
    const closes = [100, 101, 100, 100, 102];
    const vols = [10, 20, 30, 40, 50];
    // Δ: _, +, -, =, +  → OBV: 0, 20, -10, -10, 40
    const obv = computeOBV(closes, vols);
    expect(obv[0]).toBe(0);
    expect(obv[1]).toBe(20);
    expect(obv[2]).toBe(-10);
    expect(obv[3]).toBe(-10);
    expect(obv[4]).toBe(40);
  });
});

describe("MFI", () => {
  it("is 100 in a uniformly rising market", () => {
    const closes = range(30, 100, 1);
    const mfi = computeMFI(closes, closes, closes, Array(30).fill(100), 14);
    const last = mfi[mfi.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(last).toBeGreaterThan(95);
  });

  it("is 0 in a uniformly falling market", () => {
    const closes = range(30, 150, -1);
    const mfi = computeMFI(closes, closes, closes, Array(30).fill(100), 14);
    const last = mfi[mfi.length - 1];
    expect(last).not.toBeNull();
    if (last != null) expect(last).toBeLessThan(5);
  });
});

describe("Ichimoku", () => {
  it("returns conv, base, spanA, spanB arrays", () => {
    const n = 80;
    const highs = range(n, 110, 1);
    const lows = range(n, 100, 1);
    const ikh = computeIchimoku(highs, lows);
    expect(ikh.conv).toHaveLength(n);
    expect(ikh.base).toHaveLength(n);
    expect(ikh.spanA).toHaveLength(n);
    expect(ikh.spanB).toHaveLength(n);
  });
});
