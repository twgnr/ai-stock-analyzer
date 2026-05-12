import { NextRequest, NextResponse } from "next/server";
import { getQuotesWithIPODates } from "@/lib/yahoo";
import { RECENT_IPO_TICKERS } from "@/lib/ipoList";

interface CacheEntry {
  at: number;
  data: Awaited<ReturnType<typeof getQuotesWithIPODates>>;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: CacheEntry | null = null;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxDaysOld: number = typeof body?.maxDaysOld === "number" ? body.maxDaysOld : 730;

  let data: CacheEntry["data"];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    data = cache.data;
  } else {
    data = await getQuotesWithIPODates(RECENT_IPO_TICKERS);
    cache = { at: Date.now(), data };
  }

  const now = Date.now();
  const cutoff = now - maxDaysOld * 24 * 60 * 60 * 1000;

  const withDate = data.filter((r) => r.firstTradeDate && r.firstTradeDate.getTime() >= cutoff);
  const withAge = withDate.map((r) => {
    const days = r.firstTradeDate
      ? Math.floor((now - r.firstTradeDate.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const position52W =
      r.fiftyTwoWeekHigh && r.fiftyTwoWeekLow && r.fiftyTwoWeekHigh > r.fiftyTwoWeekLow
        ? ((r.price - r.fiftyTwoWeekLow) / (r.fiftyTwoWeekHigh - r.fiftyTwoWeekLow)) * 100
        : 50;
    return { ...r, daysSinceIPO: days, position52W, firstTradeDate: r.firstTradeDate?.toISOString() };
  });

  withAge.sort((a, b) => (a.daysSinceIPO ?? 9999) - (b.daysSinceIPO ?? 9999));

  return NextResponse.json({
    total: RECENT_IPO_TICKERS.length,
    withDate: data.length,
    matches: withAge.length,
    results: withAge,
  });
}
