import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Analysis } from "@/lib/models/Analysis";
import { getQuote, getFundamentals, getNews } from "@/lib/yahoo";
import { analyzeStock, hasClaudeKey, getModelName } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";
import {
  getFinnhubAnalytics,
  formatFinnhubAnalyticsForPrompt,
} from "@/lib/finnhub";
import {
  getRecentFilingsByTicker,
  formatFilingsForPrompt,
} from "@/lib/sec";
import {
  getArticlePageviews,
  guessWikipediaArticle,
  formatPageviewsForPrompt,
} from "@/lib/wikipediaPageviews";
import {
  getGoogleTrendsSnapshot,
  guessTrendsKeyword,
  formatTrendsForPrompt,
} from "@/lib/googleTrends";
import { getProviderConfig } from "@/lib/quoteProvider";

interface AnalysisSummary {
  ticker: string;
  name?: string;
  price?: number;
  currency?: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  risks?: string[];
  opportunities?: string[];
  error?: string;
}

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: tr("ai.noKey") },
      { status: 503 }
    );
  }

  const { tickers } = await req.json();
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return NextResponse.json({ error: tr("validation.tickersArrayRequired") }, { status: 400 });
  }

  const limited = tickers.slice(0, 10).map((t: string) => String(t).toUpperCase());

  try {
    await connectDB();

    // Provider-Config einmal pro Request laden — Finnhub-Key ist für alle
    // Tickers gleich.
    const providerCfg = await getProviderConfig().catch(() => null);
    const finnhubKey = providerCfg?.finnhubApiKey || "";

    const results: AnalysisSummary[] = await Promise.all(
      limited.map(async (symbol): Promise<AnalysisSummary> => {
        try {
          // Quote zuerst — wir brauchen den Firmennamen für Wiki/Trends-Lookup.
          const quote = await getQuote(symbol);
          const displayName = quote.name || symbol;
          const [
            fundamentals,
            news,
            finnhubAnalytics,
            secResult,
            pageviews,
            trends,
          ] = await Promise.all([
            getFundamentals(symbol),
            getNews(symbol, 6),
            finnhubKey
              ? getFinnhubAnalytics(symbol, finnhubKey).catch(() => ({}))
              : Promise.resolve({}),
            getRecentFilingsByTicker(symbol, {
              forms: ["10-K", "10-Q", "8-K", "4"],
              limit: 6,
            }).catch(() => null),
            getArticlePageviews(guessWikipediaArticle(displayName)).catch(
              () => null
            ),
            getGoogleTrendsSnapshot(guessTrendsKeyword(displayName), {
              days: 90,
            }).catch(() => null),
          ]);

          // Zusatz-Quellen-Blöcke fürs Prompt zusammenstellen.
          const additionalSources: string[] = [];
          const finnhubBlock = formatFinnhubAnalyticsForPrompt(finnhubAnalytics);
          if (finnhubBlock) additionalSources.push(finnhubBlock);
          if (secResult && secResult.filings.length > 0) {
            additionalSources.push(formatFilingsForPrompt(secResult.filings));
          }
          const wikiBlock = formatPageviewsForPrompt(pageviews);
          if (wikiBlock) additionalSources.push(wikiBlock);
          const trendsBlock = formatTrendsForPrompt(trends);
          if (trendsBlock) additionalSources.push(trendsBlock);

          const result = await analyzeStock(
            {
              ticker: symbol,
              name: quote.name,
              price: quote.price,
              currency: quote.currency,
              changePercent: quote.changePercent,
              fundamentals: fundamentals as Record<string, unknown> | null,
              news: news.map((n) => ({
                title: n.title,
                publisher: n.publisher,
                publishedAt: n.publishedAt,
              })),
              additionalSources,
            },
            user
          );

          const sourcesUsed = ["Yahoo Finance quote", "Yahoo Finance fundamentals"];
          if (news.length > 0) sourcesUsed.push(`${news.length} News-Artikel`);
          if (finnhubBlock) sourcesUsed.push("Finnhub Analytics");
          if (secResult && secResult.filings.length > 0) {
            sourcesUsed.push(`${secResult.filings.length} SEC-Filings`);
          }
          if (pageviews) sourcesUsed.push("Wikipedia Pageviews");
          if (trends) sourcesUsed.push("Google Trends");
          await Analysis.create({
            ticker: symbol,
            kind: "single",
            recommendation: result.recommendation,
            confidence: result.confidence,
            summary: result.summary,
            reasoning: result.reasoning,
            risks: result.risks,
            opportunities: result.opportunities,
            priceTargets: result.priceTargets,
            suggestedAllocation: result.suggestedAllocation,
            sourcesUsed,
            model: getModelName(user),
          });

          return {
            ticker: symbol,
            name: quote.name,
            price: quote.price,
            currency: quote.currency,
            recommendation: result.recommendation,
            confidence: result.confidence,
            summary: result.summary,
            reasoning: result.reasoning,
            risks: result.risks,
            opportunities: result.opportunities,
          };
        } catch (e) {
          return {
            ticker: symbol,
            error: e instanceof Error ? e.message : "Fehler",
          };
        }
      })
    );

    return NextResponse.json({ results, model: getModelName() });
  } catch (e) {
    return apiErrorResponse(e, 500, "Signal-Scan fehlgeschlagen");
  }
}
