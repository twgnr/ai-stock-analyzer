import { NextRequest, NextResponse } from "next/server";
import { runYahooScreener, type ScreenerPredefined } from "@/lib/yahoo";

interface CacheEntry {
  at: number;
  data: Awaited<ReturnType<typeof runYahooScreener>>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const VALID_PRESETS: ScreenerPredefined[] = [
  "aggressive_small_caps",
  "small_cap_gainers",
  "undervalued_growth_stocks",
  "growth_technology_stocks",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const presetRaw = body?.preset as string | undefined;
  const preset: ScreenerPredefined = VALID_PRESETS.includes(presetRaw as ScreenerPredefined)
    ? (presetRaw as ScreenerPredefined)
    : "aggressive_small_caps";
  const maxMarketCap: number | undefined =
    typeof body?.maxMarketCap === "number" ? body.maxMarketCap : undefined;
  const minMarketCap: number | undefined =
    typeof body?.minMarketCap === "number" ? body.minMarketCap : undefined;

  const cacheKey = preset;
  const hit = cache.get(cacheKey);
  let data: CacheEntry["data"];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    data = hit.data;
  } else {
    data = await runYahooScreener(preset, 50);
    cache.set(cacheKey, { at: Date.now(), data });
  }

  let filtered = data;
  if (maxMarketCap != null) {
    filtered = filtered.filter((r) => r.marketCap != null && r.marketCap <= maxMarketCap);
  }
  if (minMarketCap != null) {
    filtered = filtered.filter((r) => r.marketCap != null && r.marketCap >= minMarketCap);
  }
  filtered = [...filtered].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  return NextResponse.json({ preset, total: data.length, matches: filtered.length, results: filtered });
}
