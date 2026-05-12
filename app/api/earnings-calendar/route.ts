import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { yahooFinance } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface UpcomingEarnings {
  ticker: string;
  name: string;
  earningsDate: string;
  estimateEPS?: number;
  currency: string;
  inPortfolio: boolean;
  inWatchlist: boolean;
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const [positions, watchlist] = await Promise.all([
    Position.find({ userId: user._id }).select("ticker").lean(),
    Watchlist.find({ userId: user._id }).select("ticker").lean(),
  ]);

  const portfolioSet = new Set(positions.map((p) => p.ticker));
  const watchlistSet = new Set(watchlist.map((w) => w.ticker));
  const allTickers = [...new Set([...portfolioSet, ...watchlistSet])];

  if (allTickers.length === 0) return NextResponse.json({ items: [] });

  const items: UpcomingEarnings[] = [];
  await Promise.all(
    allTickers.map(async (ticker) => {
      try {
        const s = await yahooFinance.quoteSummary(ticker, {
          modules: ["calendarEvents", "price"],
        });
        const ev = s.calendarEvents?.earnings;
        const dates = ev?.earningsDate;
        if (!dates || dates.length === 0) return;
        const firstDate = dates[0];
        if (!firstDate) return;
        items.push({
          ticker,
          name: s.price?.longName || s.price?.shortName || ticker,
          earningsDate: new Date(firstDate).toISOString(),
          estimateEPS: ev?.earningsAverage,
          currency: s.price?.currency || "USD",
          inPortfolio: portfolioSet.has(ticker),
          inWatchlist: watchlistSet.has(ticker),
        });
      } catch {
        // ignore per-ticker failures
      }
    })
  );

  items.sort(
    (a, b) => new Date(a.earningsDate).getTime() - new Date(b.earningsDate).getTime()
  );
  return NextResponse.json({ items });
}
