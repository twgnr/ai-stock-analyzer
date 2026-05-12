import { describe, it, expect } from "vitest";
import {
  returnsFromCloses,
  stddev,
  covariance,
  correlation,
  beta,
  alignLast,
} from "@/lib/stats";

describe("stats / returnsFromCloses", () => {
  it("yields N-1 returns", () => {
    expect(returnsFromCloses([100, 110, 99])).toHaveLength(2);
  });
  it("computes simple returns correctly", () => {
    const r = returnsFromCloses([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1, 6);
    expect(r[1]).toBeCloseTo(-0.1, 6);
  });
  it("handles zero previous price", () => {
    expect(returnsFromCloses([0, 10])[0]).toBe(0);
  });
});

describe("stats / stddev", () => {
  it("returns 0 for single-element arrays", () => {
    expect(stddev([5])).toBe(0);
  });
  it("matches known sample stddev (n-1)", () => {
    // sample stddev of [2,4,4,4,5,5,7,9] = 2
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
});

describe("stats / correlation", () => {
  it("returns 1 for identical series", () => {
    expect(correlation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 6);
  });
  it("returns -1 for perfectly inverse series", () => {
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });
  it("returns 0 when one series has zero variance", () => {
    expect(correlation([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("stats / beta", () => {
  it("yields 1 when asset equals benchmark", () => {
    const b = beta([0.01, -0.02, 0.03], [0.01, -0.02, 0.03]);
    expect(b).toBeCloseTo(1, 6);
  });
  it("doubles when asset is 2x benchmark", () => {
    const b = beta([0.02, -0.04, 0.06], [0.01, -0.02, 0.03]);
    expect(b).toBeCloseTo(2, 6);
  });
  it("returns 0 when benchmark is constant", () => {
    expect(beta([0.01, 0.02], [0.05, 0.05])).toBe(0);
  });
});

describe("stats / covariance", () => {
  it("is symmetric", () => {
    const a = [1, 2, 3, 4];
    const b = [2, 4, 6, 8];
    expect(covariance(a, b)).toBeCloseTo(covariance(b, a), 9);
  });
  it("returns 0 for length < 2", () => {
    expect(covariance([1], [1])).toBe(0);
  });
});

describe("stats / alignLast", () => {
  it("trims to min length keeping the tail", () => {
    const [a, b] = alignLast([1, 2, 3, 4, 5], [10, 20, 30]);
    expect(a).toEqual([3, 4, 5]);
    expect(b).toEqual([10, 20, 30]);
  });
});
