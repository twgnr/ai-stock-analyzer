import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Analysis } from "@/lib/models/Analysis";
import { getQuote, getFundamentals, getNews } from "@/lib/yahoo";
import { getRedditPosts } from "@/lib/reddit";
import { analyzeStock, hasClaudeKey, getModelName } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/rateLimit";
import { apiErrorResponse } from "@/lib/apiError";
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
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const limited = rateLimitResponse(`analyze-stock:${user.userId}`, 60, 60 * 60);
  if (limited) return limited;

  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const { ticker } = await req.json();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const symbol = String(ticker).toUpperCase();

  try {
    await connectDB();
    const quote = await getQuote(symbol);

    // Provider-Config für Finnhub-Key. Wenn der Admin Finnhub aktiviert (oder
    // einen Key hinterlegt) hat, ziehen wir hier auch die Analytics-Endpoints.
    const providerCfg = await getProviderConfig().catch(() => null);
    const finnhubKey = providerCfg?.finnhubApiKey || "";

    const [
      fundamentals,
      news,
      redditPosts,
      finnhubAnalytics,
      secResult,
      pageviews,
      trends,
    ] = await Promise.all([
      getFundamentals(symbol),
      getNews(symbol, 10),
      // Reddit ist nur Stimmungs-Beiwerk fürs Prompt — ein 403/Rate-Limit
      // darf die ganze Analyse nicht killen. Wir liefern dann eben ohne
      // Reddit-Buzz an die KI.
      getRedditPosts(symbol, quote.name, 15, "week").catch(() => []),
      finnhubKey
        ? getFinnhubAnalytics(symbol, finnhubKey).catch(() => ({}))
        : Promise.resolve({}),
      getRecentFilingsByTicker(symbol, {
        forms: ["10-K", "10-Q", "8-K", "4"],
        limit: 8,
      }).catch(() => null),
      getArticlePageviews(guessWikipediaArticle(quote.name || symbol)).catch(
        () => null
      ),
      getGoogleTrendsSnapshot(guessTrendsKeyword(quote.name || symbol), {
        days: 90,
      }).catch(() => null),
    ]);

    const topReddit = [...redditPosts]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((p) => ({
        title: p.title,
        subreddit: p.subreddit,
        score: p.score,
        numComments: p.numComments,
      }));

    // Zusätzliche Quellen-Blöcke fürs KI-Prompt zusammenstellen.
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
        redditPosts: topReddit,
        additionalSources,
      },
      user
    );

    const sourcesUsed = ["Yahoo Finance quote", "Yahoo Finance fundamentals"];
    if (news.length > 0) sourcesUsed.push(`${news.length} News-Artikel`);
    if (redditPosts.length > 0) sourcesUsed.push(`${redditPosts.length} Reddit-Posts`);
    if (finnhubBlock) sourcesUsed.push("Finnhub Analytics");
    if (secResult && secResult.filings.length > 0) {
      sourcesUsed.push(`${secResult.filings.length} SEC-Filings`);
    }
    if (pageviews) sourcesUsed.push("Wikipedia Pageviews");
    if (trends) sourcesUsed.push("Google Trends");

    const modelName = getModelName(user);
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
      model: modelName,
    });

    return NextResponse.json({ ...result, ticker: symbol, sourcesUsed, model: modelName });
  } catch (e) {
    return apiErrorResponse(e, 500, "Analyse fehlgeschlagen.");
  }
}
