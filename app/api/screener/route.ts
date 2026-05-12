import { NextRequest, NextResponse } from "next/server";
import { getQuotesBatch } from "@/lib/yahoo";
import { applyFilters, type ScreenerFilters } from "@/lib/screener";
import { UNIVERSE, getUniverseByRegion } from "@/lib/screenerUniverse";

interface CacheEntry {
  at: number;
  data: Awaited<ReturnType<typeof getQuotesBatch>>;
  region: "DE" | "EU" | "US" | "AS";
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const quoteCache = new Map<string, CacheEntry>();

async function getCachedQuotes(regions: Array<"DE" | "EU" | "US" | "AS">) {
  const entries = getUniverseByRegion(regions);
  const now = Date.now();
  const needed: string[] = [];
  const cached: Array<CacheEntry["data"][number] & { region: "DE" | "EU" | "US" | "AS" }> = [];

  for (const u of entries) {
    const hit = quoteCache.get(u.ticker);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      cached.push({ ...hit.data[0], region: hit.region });
    } else {
      needed.push(u.ticker);
    }
  }

  if (needed.length > 0) {
    const fresh = await getQuotesBatch(needed);
    const regionMap = new Map(UNIVERSE.map((u) => [u.ticker, u.region]));
    for (const q of fresh) {
      const region = regionMap.get(q.ticker) || "US";
      quoteCache.set(q.ticker, { at: now, data: [q], region });
      cached.push({ ...q, region });
    }
  }

  return cached;
}

export async function POST(req: NextRequest) {
  const filters: ScreenerFilters = await req.json().catch(() => ({}));
  const regions = filters.regions && filters.regions.length > 0 ? filters.regions : ["DE", "EU", "US"];

  try {
    const quotes = await getCachedQuotes(regions as Array<"DE" | "EU" | "US" | "AS">);
    const results = applyFilters(quotes, filters);
    results.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return NextResponse.json({
      total: quotes.length,
      matches: results.length,
      results: results.slice(0, 100),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Screener-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
