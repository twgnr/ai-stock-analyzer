import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote, getNews, getChart, getFundamentals } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface PreviewResponse {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  currency: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketCap?: number;
  peRatio?: number | null;
  dividendYield?: number | null;
  sector?: string | null;
  closes: number[];
  topNews?: { title: string; publisher: string; publishedAt: string };
  asOf: number;
}

interface CacheEntry {
  at: number;
  data: PreviewResponse;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const [quote, candlesResult, newsResult, fundResult] = await Promise.allSettled([
      getQuote(ticker),
      getChart(ticker, "3mo", "1d"),
      getNews(ticker, 1),
      getFundamentals(ticker),
    ]);

    if (quote.status !== "fulfilled") {
      return NextResponse.json({ error: t("validation.tickerNotFound") }, { status: 404 });
    }
    const q = quote.value;

    const closes =
      candlesResult.status === "fulfilled"
        ? candlesResult.value.map((c) => c.close).filter((v) => Number.isFinite(v))
        : [];

    const news =
      newsResult.status === "fulfilled" && newsResult.value.length > 0
        ? newsResult.value[0]
        : null;

    const fund = fundResult.status === "fulfilled" ? fundResult.value : null;

    const data: PreviewResponse = {
      ticker,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
      currency: q.currency,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      marketCap: q.marketCap,
      peRatio: num(fund?.peRatio),
      dividendYield: num(fund?.dividendYield),
      sector: fund?.sector || null,
      closes,
      topNews: news
        ? {
            title: news.title,
            publisher: news.publisher,
            publishedAt: news.publishedAt,
          }
        : undefined,
      asOf: Date.now(),
    };

    cache.set(ticker, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Preview-Fehler" },
      { status: 500 }
    );
  }
}
