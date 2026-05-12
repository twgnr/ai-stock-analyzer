import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getNews } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface NewsRow {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  ticker: string;
  /** Sekunden seit Veröffentlichung — vom Server vorberechnet, damit das UI
   *  nicht ständig neu rechnen muss. */
  ageSec: number;
}

const TOP_N = 20;
const PER_TICKER = 5;
const MAX_TICKERS = 30;

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const [positions, watchlist] = await Promise.all([
    Position.find({ userId: user._id }).select("ticker").lean(),
    Watchlist.find({ userId: user._id }).select("ticker").lean(),
  ]);

  const tickers = Array.from(
    new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...watchlist.map((w) => w.ticker.toUpperCase()),
    ])
  ).slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ rows: [], totalTickers: 0 });
  }

  const newsByTicker = await Promise.allSettled(
    tickers.map((t) => getNews(t, PER_TICKER))
  );

  const all: NewsRow[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (let i = 0; i < tickers.length; i++) {
    const result = newsByTicker[i];
    if (result.status !== "fulfilled") continue;
    for (const n of result.value) {
      // Yahoo-Newsfeeds geben gelegentlich denselben Artikel an mehrere Tickers
      // aus (z. B. bei Sektor-News). Per Link entduplizieren.
      const key = n.link || `${n.publisher}::${n.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ts = new Date(n.publishedAt).getTime();
      const ageSec = Number.isFinite(ts)
        ? Math.max(0, Math.round((now - ts) / 1000))
        : Number.MAX_SAFE_INTEGER;
      all.push({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: n.publishedAt,
        ticker: tickers[i],
        ageSec,
      });
    }
  }

  // Nach Aktualität sortieren, älteste raus.
  all.sort((a, b) => a.ageSec - b.ageSec);
  const rows = all.slice(0, TOP_N);

  return NextResponse.json({
    rows,
    totalTickers: tickers.length,
    asOf: now,
  });
}
