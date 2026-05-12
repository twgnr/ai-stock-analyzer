import { NextRequest, NextResponse } from "next/server";
import { getChart, getQuotesBatch, getNews, type Candle } from "@/lib/yahoo";
import {
  analyzeBreakout,
  computeCatalystScore,
  type BreakoutAnalysis,
  type CatalystScore,
} from "@/lib/breakout";
import { getUniverseByRegion, type Region } from "@/lib/screenerUniverse";
import {
  getArticlePageviews,
  guessWikipediaArticle,
} from "@/lib/wikipediaPageviews";
import {
  getGoogleTrendsSnapshot,
  guessTrendsKeyword,
} from "@/lib/googleTrends";
import {
  getFinnhubAnalytics,
  type FinnhubAnalyticsSummary,
} from "@/lib/finnhub";
import { getProviderConfig } from "@/lib/quoteProvider";

interface ChartCacheEntry {
  at: number;
  candles: Candle[];
}

const CHART_CACHE_TTL_MS = 30 * 60 * 1000;
const chartCache = new Map<string, ChartCacheEntry>();

async function getCachedChart(ticker: string): Promise<Candle[]> {
  const hit = chartCache.get(ticker);
  if (hit && Date.now() - hit.at < CHART_CACHE_TTL_MS) return hit.candles;
  try {
    const candles = await getChart(ticker, "1y", "1d");
    chartCache.set(ticker, { at: Date.now(), candles });
    return candles;
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Wieviele Top-Tickers (nach techn. Score) bekommen den Catalyst-Boost? */
const CATALYST_TOP_N = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const regions: Region[] =
    Array.isArray(body?.regions) && body.regions.length > 0
      ? body.regions
      : ["DE", "EU", "US", "AS"];
  const minScore: number = typeof body?.minScore === "number" ? body.minScore : 50;
  const withCatalysts: boolean = body?.withCatalysts === true;

  try {
    const universe = getUniverseByRegion(regions);
    const tickers = universe.map((u) => u.ticker);
    const regionMap = new Map(universe.map((u) => [u.ticker, u.region]));

    const quotes = await getQuotesBatch(tickers);
    const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

    const candlesList = await mapLimit(tickers, 8, getCachedChart);

    type Row = {
      ticker: string;
      name: string;
      price: number;
      currency: string;
      changePercent: number;
      marketCap?: number;
      region: Region;
      analysis: BreakoutAnalysis;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
      /** Wenn `withCatalysts`: zusätzlicher Score + Begründungen aus Aufmerksamkeits-/News-Daten. */
      catalysts?: CatalystScore & {
        wikiSpike?: number | null;
        trendsSpike?: number | null;
        recentNewsCount?: number;
        risingQueries?: string[];
      };
      /** technischer Score + Catalyst-Score, falls vorhanden, sonst nur technisch. */
      totalScore: number;
    };

    const rows: Row[] = [];
    tickers.forEach((t, i) => {
      const candles = candlesList[i];
      const quote = quoteMap.get(t.toUpperCase());
      if (!quote || !candles || candles.length < 50) return;
      if (!quote.fiftyTwoWeekHigh) return;
      const analysis = analyzeBreakout({
        candles,
        price: quote.price,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      });
      if (!analysis) return;
      if (analysis.score < minScore) return;
      rows.push({
        ticker: quote.ticker,
        name: quote.name,
        price: quote.price,
        currency: quote.currency,
        changePercent: quote.changePercent,
        marketCap: quote.marketCap,
        region: regionMap.get(t) ?? "US",
        analysis,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        totalScore: analysis.score,
      });
    });

    rows.sort((a, b) => b.analysis.score - a.analysis.score);

    // ── Catalyst-Boost (optional) ─────────────────────────────────────────
    // Nur die Top-N nach technischem Score bekommen Catalyst-Daten — sonst
    // wäre der Scan extrem langsam (Wiki/Trends pro Ticker = mehrere Sekunden).
    let catalystsApplied = 0;
    if (withCatalysts && rows.length > 0) {
      const topRows = rows.slice(0, CATALYST_TOP_N);
      const providerCfg = await getProviderConfig().catch(() => null);
      const finnhubKey = providerCfg?.finnhubApiKey || "";

      await Promise.all(
        topRows.map(async (row) => {
          const [wiki, trends, news, finnhub] = await Promise.all([
            getArticlePageviews(guessWikipediaArticle(row.name || row.ticker)).catch(
              () => null
            ),
            getGoogleTrendsSnapshot(guessTrendsKeyword(row.name || row.ticker), {
              days: 90,
            }).catch(() => null),
            getNews(row.ticker, 8).catch(() => []),
            finnhubKey
              ? getFinnhubAnalytics(row.ticker, finnhubKey).catch(
                  () => ({}) as FinnhubAnalyticsSummary
                )
              : Promise.resolve({} as FinnhubAnalyticsSummary),
          ]);

          // News der letzten 7 Tage zählen.
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const recentNewsCount = news.filter((n) => {
            const ts = new Date(n.publishedAt).getTime();
            return Number.isFinite(ts) && ts >= sevenDaysAgo;
          }).length;

          // Bullisch-Anteil aus Recommendation-Trends.
          let bullishAnalystShare: number | null = null;
          if (finnhub.recommendation) {
            const r = finnhub.recommendation;
            const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
            if (total > 0) bullishAnalystShare = (r.strongBuy + r.buy) / total;
          }

          const cat = computeCatalystScore({
            wikiSpike: wiki?.spikeRatio ?? null,
            trendsSpike: trends?.spikeRatio ?? null,
            recentNewsCount,
            insiderMspr: finnhub.insiderSentiment?.mspr ?? null,
            bullishAnalystShare,
          });

          row.catalysts = {
            ...cat,
            wikiSpike: wiki?.spikeRatio ?? null,
            trendsSpike: trends?.spikeRatio ?? null,
            recentNewsCount,
            risingQueries: trends?.rising.slice(0, 3).map((r) => r.query) ?? [],
          };
          row.totalScore = row.analysis.score + cat.catalystScore;
          if (cat.catalystScore > 0) catalystsApplied++;
        })
      );

      // Re-sortieren nach totalScore (technisch + catalyst).
      rows.sort((a, b) => b.totalScore - a.totalScore);
    }

    return NextResponse.json({
      total: tickers.length,
      matches: rows.length,
      results: rows.slice(0, 50),
      catalystsEnabled: withCatalysts,
      catalystsApplied,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Breakout-Scan fehlgeschlagen";
    console.error("[breakout]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
