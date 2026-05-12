import { NextRequest, NextResponse } from "next/server";
import { getChart } from "@/lib/yahoo";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

interface CacheEntry {
  at: number;
  data: { date: string; close: number }[];
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const AVAILABLE: Record<string, { label: string; ticker: string }> = {
  sp500: { label: "S&P 500", ticker: "^GSPC" },
  nasdaq: { label: "NASDAQ 100", ticker: "^NDX" },
  dax: { label: "DAX 40", ticker: "^GDAXI" },
  stoxx600: { label: "STOXX 600", ticker: "^STOXX" },
  msciworld: { label: "MSCI World (ETF)", ticker: "URTH" },
  gold: { label: "Gold (ETF)", ticker: "GLD" },
};

async function getSeries(ticker: string, days: number): Promise<CacheEntry["data"]> {
  const key = `${ticker}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const range = days > 365 ? "2y" : days > 180 ? "1y" : days > 90 ? "6mo" : "3mo";
  try {
    const candles = await getChart(ticker, range as never, "1d");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = candles
      .filter((c) => new Date(c.time * 1000) >= cutoff)
      .map((c) => ({
        date: new Date(c.time * 1000).toISOString().slice(0, 10),
        close: c.close,
      }));
    cache.set(key, { at: Date.now(), data: filtered });
    return filtered;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get("days") || "180");
  const keysParam = req.nextUrl.searchParams.get("keys");
  const keys = keysParam ? keysParam.split(",") : ["sp500", "msciworld", "dax"];

  const result: Array<{ key: string; label: string; ticker: string; series: CacheEntry["data"] }> = [];
  for (const key of keys) {
    const info = AVAILABLE[key];
    if (!info) continue;
    const series = await getSeries(info.ticker, days);
    if (series.length > 0) {
      result.push({ key, label: info.label, ticker: info.ticker, series });
    }
  }

  return NextResponse.json({ available: AVAILABLE, benchmarks: result });
}
