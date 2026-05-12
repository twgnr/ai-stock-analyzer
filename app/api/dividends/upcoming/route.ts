import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { getDividendInfo } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface UpcomingDividend {
  ticker: string;
  name: string;
  exDate: string;
  payDate?: string;
  dividendRate?: number;
  currency: string;
  payoutsPerYear: number;
  payoutFrequency: string;
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

  const results = await Promise.allSettled(
    allTickers.map((t) => getDividendInfo(t))
  );

  const items: UpcomingDividend[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const info = r.value;
    if (!info.exDividendDate) continue;
    items.push({
      ticker: info.ticker,
      name: info.name || info.ticker,
      exDate: new Date(info.exDividendDate + "T00:00:00Z").toISOString(),
      payDate: info.payDate
        ? new Date(info.payDate + "T00:00:00Z").toISOString()
        : undefined,
      dividendRate: info.dividendRate,
      currency: info.currency,
      payoutsPerYear: info.payoutsPerYear,
      payoutFrequency: info.payoutFrequency,
      inPortfolio: portfolioSet.has(info.ticker),
      inWatchlist: watchlistSet.has(info.ticker),
    });
  }

  items.sort((a, b) => new Date(a.exDate).getTime() - new Date(b.exDate).getTime());

  return NextResponse.json({ items });
}
