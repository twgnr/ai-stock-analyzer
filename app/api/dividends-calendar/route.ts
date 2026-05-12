import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { getDividendInfo, type DividendInfo } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface CalendarItem {
  ticker: string;
  name?: string;
  currency: string;
  exDividendDate?: string;
  daysUntil?: number;
  dividendRate?: number;
  dividendYield?: number;
  payoutRatio?: number;
  payoutsPerYear: number;
  payoutFrequency: string;
  inPortfolio: boolean;
  inWatchlist: boolean;
  latestAmount?: number;
  latestDate?: string;
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const [positions, watchlist] = await Promise.all([
    Position.find({ userId: user._id }).lean(),
    Watchlist.find({ userId: user._id }).lean(),
  ]);

  const portfolioTickers = new Set(positions.map((p) => p.ticker.toUpperCase()));
  const watchTickers = new Set(watchlist.map((w) => w.ticker.toUpperCase()));
  const allTickers = [...new Set([...portfolioTickers, ...watchTickers])];

  if (allTickers.length === 0) {
    return NextResponse.json({ items: [], warnings: ["Keine Positionen oder Watchlist-Einträge."] });
  }

  const results = await Promise.allSettled(
    allTickers.map((t) => getDividendInfo(t))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items: CalendarItem[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const info: DividendInfo = r.value;
    if (info.dividendRate == null && !info.exDividendDate) continue;

    let daysUntil: number | undefined;
    if (info.exDividendDate) {
      const d = new Date(info.exDividendDate + "T00:00:00Z");
      daysUntil = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    const latest = info.history[info.history.length - 1];
    items.push({
      ticker: info.ticker,
      name: info.name,
      currency: info.currency,
      exDividendDate: info.exDividendDate,
      daysUntil,
      dividendRate: info.dividendRate,
      dividendYield: info.dividendYield,
      payoutRatio: info.payoutRatio,
      payoutsPerYear: info.payoutsPerYear,
      payoutFrequency: info.payoutFrequency,
      inPortfolio: portfolioTickers.has(info.ticker),
      inWatchlist: watchTickers.has(info.ticker),
      latestAmount: latest?.amount,
      latestDate: latest?.date,
    });
  }

  // Sortierung: zukünftige Ex-Termine zuerst (aufsteigend), dann vergangene (absteigend)
  items.sort((a, b) => {
    const da = a.daysUntil;
    const db = b.daysUntil;
    const aFuture = da != null && da >= 0;
    const bFuture = db != null && db >= 0;
    if (aFuture && bFuture) return (da ?? 0) - (db ?? 0);
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    return (db ?? 0) - (da ?? 0);
  });

  return NextResponse.json({ items });
}
