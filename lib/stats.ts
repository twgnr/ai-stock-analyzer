export function returnsFromCloses(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) rets.push((closes[i] - prev) / prev);
    else rets.push(0);
  }
  return rets;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

export function stddev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

export function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

export function correlation(xs: number[], ys: number[]): number {
  const sx = stddev(xs);
  const sy = stddev(ys);
  if (sx === 0 || sy === 0) return 0;
  return covariance(xs, ys) / (sx * sy);
}

export function beta(assetReturns: number[], benchmarkReturns: number[]): number {
  const bVar = variance(benchmarkReturns);
  if (bVar === 0) return 0;
  return covariance(assetReturns, benchmarkReturns) / bVar;
}

// Alignment: bring two aligned return series to equal length (take last N of each)
export function alignLast<T>(a: T[], b: T[]): [T[], T[]] {
  const n = Math.min(a.length, b.length);
  return [a.slice(-n), b.slice(-n)];
}
