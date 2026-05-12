import { NextRequest, NextResponse } from "next/server";
import { getChart } from "@/lib/yahoo";

interface CacheEntry {
  at: number;
  data: number[];
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

async function getSparklineData(ticker: string): Promise<number[]> {
  const hit = cache.get(ticker);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.data;
  try {
    const candles = await getChart(ticker, "3mo", "1d");
    const closes = candles.map((c) => c.close);
    cache.set(ticker, { at: now, data: closes });
    return closes;
  } catch {
    return [];
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tickers: string[] = Array.isArray(body?.tickers) ? body.tickers : [];
  if (tickers.length === 0) return NextResponse.json({});

  const limited = tickers.slice(0, 50);
  const results = await mapLimit(limited, 8, getSparklineData);

  const out: Record<string, number[]> = {};
  limited.forEach((t, i) => {
    if (results[i].length > 0) out[t] = results[i];
  });
  return NextResponse.json(out);
}
