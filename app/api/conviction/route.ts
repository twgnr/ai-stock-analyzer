import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { computeConvictionForTickers } from "@/lib/convictionScore";
import { getApiTranslations } from "@/lib/i18n-server";

interface CacheEntry {
  at: number;
  results: Map<string, Awaited<ReturnType<typeof computeConvictionForTickers>> extends Map<string, infer V> ? V : never>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  const tickersParam = req.nextUrl.searchParams.get("tickers");
  if (!tickersParam) return NextResponse.json({ scores: {} });
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (tickers.length === 0) return NextResponse.json({ scores: {} });

  const now = Date.now();
  const needed: string[] = [];
  const results: Record<string, unknown> = {};

  for (const t of tickers) {
    const hit = cache.get(t);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      const score = hit.results.get(t);
      if (score) results[t] = score;
    } else {
      needed.push(t);
    }
  }

  if (needed.length > 0) {
    const fresh = await computeConvictionForTickers(needed);
    for (const [t, score] of fresh) {
      results[t] = score;
      cache.set(t, {
        at: now,
        results: new Map([[t, score]]),
      });
    }
  }

  return NextResponse.json({ scores: results });
}
