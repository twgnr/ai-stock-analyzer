import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getQuote } from "@/lib/yahoo";
import {
  getArticlePageviews,
  guessWikipediaArticle,
} from "@/lib/wikipediaPageviews";
import {
  getGoogleTrendsSnapshot,
  guessTrendsKeyword,
} from "@/lib/googleTrends";
import { getApiTranslations } from "@/lib/i18n-server";

interface AttentionRow {
  ticker: string;
  name: string;
  source: "portfolio" | "watchlist" | "both";
  wikipedia?: { spikeRatio: number; recentAvg7d: number; baselineAvg30d: number };
  googleTrends?: {
    spikeRatio: number;
    recentAvg7d: number;
    baselineAvg30d: number;
    rising: Array<{ query: string; formatted: string }>;
  };
  /** Kombiniertes Spike-Maß (Max der beiden Quellen). Sortier-Schlüssel. */
  combinedSpike: number;
}

const MAX_TICKERS = 50;

export async function GET() {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const [positions, watchlist] = await Promise.all([
    Position.find({ userId: user._id }).select("ticker name").lean(),
    Watchlist.find({ userId: user._id }).select("ticker name").lean(),
  ]);

  // Quellen-Mapping pro Ticker zusammenführen.
  const sourceMap = new Map<string, AttentionRow["source"]>();
  for (const p of positions) sourceMap.set(p.ticker.toUpperCase(), "portfolio");
  for (const w of watchlist) {
    const t = w.ticker.toUpperCase();
    sourceMap.set(t, sourceMap.has(t) ? "both" : "watchlist");
  }
  const tickers = Array.from(sourceMap.keys()).slice(0, MAX_TICKERS);
  if (tickers.length === 0) {
    return NextResponse.json({ rows: [], totalTickers: 0 });
  }

  // Quotes für Namen — sequentiell wäre teuer, also parallel.
  const quotes = await Promise.allSettled(tickers.map((t) => getQuote(t)));
  const nameByTicker = new Map<string, string>();
  for (let i = 0; i < tickers.length; i++) {
    const q = quotes[i];
    if (q.status === "fulfilled") {
      nameByTicker.set(tickers[i], q.value.name || tickers[i]);
    } else {
      nameByTicker.set(tickers[i], tickers[i]);
    }
  }

  // Wikipedia + Google Trends parallel pro Ticker. Beide haben eigene Caches
  // (6h), das hier ist also nach dem ersten Aufruf billig.
  const rows: AttentionRow[] = await Promise.all(
    tickers.map(async (t): Promise<AttentionRow> => {
      const name = nameByTicker.get(t) || t;
      const source = sourceMap.get(t) || "watchlist";
      const [wiki, trends] = await Promise.all([
        getArticlePageviews(guessWikipediaArticle(name)).catch(() => null),
        getGoogleTrendsSnapshot(guessTrendsKeyword(name), { days: 90 }).catch(
          () => null
        ),
      ]);
      const wikiPart = wiki
        ? {
            spikeRatio: wiki.spikeRatio,
            recentAvg7d: wiki.recentAvg7d,
            baselineAvg30d: wiki.baselineAvg30d,
          }
        : undefined;
      const trendsPart = trends
        ? {
            spikeRatio: trends.spikeRatio,
            recentAvg7d: trends.recentAvg7d,
            baselineAvg30d: trends.baselineAvg30d,
            rising: trends.rising.map((r) => ({
              query: r.query,
              formatted: r.formatted,
            })),
          }
        : undefined;
      const combinedSpike = Math.max(
        wikiPart?.spikeRatio ?? 0,
        trendsPart?.spikeRatio ?? 0
      );
      return {
        ticker: t,
        name,
        source,
        wikipedia: wikiPart,
        googleTrends: trendsPart,
        combinedSpike,
      };
    })
  );

  // Nach kombiniertem Spike absteigend sortieren — die spannendsten zuerst.
  rows.sort((a, b) => b.combinedSpike - a.combinedSpike);

  return NextResponse.json({
    rows,
    totalTickers: tickers.length,
    asOf: Date.now(),
  });
}
