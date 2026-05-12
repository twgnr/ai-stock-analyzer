import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { getChart, getNews, getQuotesBatch } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

// Pragmatischer Wochen-Report ohne eigenen Mail-Workflow: liefert JSON, das
// die UI zu einem strukturierten Briefing rendert. Mail-Versand kann später
// über den existierenden digestService nachgerüstet werden.

interface Mover {
  ticker: string;
  name?: string;
  weekChangePct: number;
  inPortfolio: boolean;
}

interface NewsItem {
  ticker: string;
  title: string;
  publisher: string;
  publishedAt: string;
  link: string;
}

export async function GET() {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const [positions, watchlist, theses] = await Promise.all([
    Position.find({ userId: user._id }).lean(),
    Watchlist.find({ userId: user._id }).lean(),
    InvestmentThesis.find({
      userId: user._id,
      status: { $in: ["ACTIVE", "ON_TRACK", "AT_RISK", "BROKEN"] },
    }).lean(),
  ]);

  const portfolioTickers = new Set(positions.map((p) => p.ticker.toUpperCase()));
  const allTickers = Array.from(
    new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...watchlist.map((w) => w.ticker.toUpperCase()),
    ])
  );

  if (allTickers.length === 0) {
    return NextResponse.json({
      positions: 0,
      watchlist: 0,
      message: "Keine Ticker in Portfolio oder Watchlist — nichts zu briefen.",
    });
  }

  // Wochen-Performance: aus 7-Tage-Chart den Rückgabewert end/start
  const movers: Mover[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < allTickers.length; i += 6) chunks.push(allTickers.slice(i, i + 6));
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (t) => {
        try {
          const candles = await getChart(t, "5d", "1d");
          if (!candles || candles.length < 2) return null;
          const first = candles[0].close;
          const last = candles[candles.length - 1].close;
          if (first <= 0) return null;
          return {
            ticker: t,
            weekChangePct: ((last - first) / first) * 100,
          };
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) movers.push({ ...r, inPortfolio: portfolioTickers.has(r.ticker) });
    }
  }

  // Namen anreichern
  const quotes = await getQuotesBatch(allTickers);
  const nameMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q.name]));
  for (const m of movers) m.name = nameMap.get(m.ticker);
  movers.sort((a, b) => Math.abs(b.weekChangePct) - Math.abs(a.weekChangePct));

  const topGainers = [...movers]
    .filter((m) => m.weekChangePct > 0)
    .sort((a, b) => b.weekChangePct - a.weekChangePct)
    .slice(0, 5);
  const topLosers = [...movers]
    .filter((m) => m.weekChangePct < 0)
    .sort((a, b) => a.weekChangePct - b.weekChangePct)
    .slice(0, 5);

  // News der letzten Woche — pro Portfolio-Ticker max 2
  const news: NewsItem[] = [];
  const portfolioTickerList = Array.from(portfolioTickers);
  const newsChunks: string[][] = [];
  for (let i = 0; i < portfolioTickerList.length; i += 5) {
    newsChunks.push(portfolioTickerList.slice(i, i + 5));
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const chunk of newsChunks) {
    const results = await Promise.all(
      chunk.map(async (t) => {
        try {
          const items = await getNews(t, 3);
          return items
            .filter((n) => new Date(n.publishedAt).getTime() >= weekAgo)
            .slice(0, 2)
            .map((n) => ({
              ticker: t,
              title: n.title,
              publisher: n.publisher,
              publishedAt: n.publishedAt,
              link: n.link,
            }));
        } catch {
          return [];
        }
      })
    );
    for (const list of results) news.push(...list);
  }
  news.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  // Thesen im Fokus (AT_RISK/BROKEN)
  const thesenAtRisk = theses
    .filter((t) => t.status === "AT_RISK" || t.status === "BROKEN")
    .map((t) => ({
      ticker: t.ticker,
      status: t.status,
      verdict: t.lastCheckVerdict,
      checkedAt: t.lastCheckAt,
    }));

  // Ungeprüfte Thesen
  const unchecked = theses
    .filter((t) => t.status === "ACTIVE" && !t.lastCheckAt)
    .map((t) => ({ ticker: t.ticker, createdAt: t.createdAt }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    positions: positions.length,
    watchlist: watchlist.length,
    topGainers,
    topLosers,
    news: news.slice(0, 20),
    thesenAtRisk,
    thesenUnchecked: unchecked,
  });
}

export const runtime = "nodejs";
