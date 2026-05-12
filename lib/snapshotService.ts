import { Types } from "mongoose";
import { connectDB } from "./mongodb";
import { User } from "./models/User";
import { Position } from "./models/Position";
import { PortfolioSnapshot } from "./models/PortfolioSnapshot";
import { RealizedGain } from "./models/RealizedGain";
import { getQuotes } from "./yahoo";
import { getRates, BASE_CURRENCY } from "./fx";

export async function captureSnapshotForUser(userId: Types.ObjectId | string): Promise<boolean> {
  await connectDB();
  const positions = await Position.find({ userId }).lean();
  if (positions.length === 0) return false;

  const tickers = positions.map((p) => p.ticker);
  const quotes = await getQuotes(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  const currencies = [
    ...new Set<string>(
      quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))
    ),
  ];
  const fxRates = await getRates(currencies, BASE_CURRENCY);
  const rateFor = (c: string) =>
    c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

  let totalValueBase = 0;
  let totalCostBase = 0;
  for (const p of positions) {
    const q = quoteMap.get(p.ticker);
    const price = q?.price ?? p.avgPrice;
    const tradingCurrency = q?.currency || p.currency;
    totalValueBase += price * p.shares * rateFor(tradingCurrency);
    totalCostBase += p.avgPrice * p.shares * rateFor(p.currency);
  }

  const yearStart = new Date();
  yearStart.setMonth(0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const ytdAgg = await RealizedGain.aggregate([
    { $match: { userId, saleDate: { $gte: yearStart } } },
    { $group: { _id: null, total: { $sum: "$gainBase" } } },
  ]);
  const realizedGainYTD = ytdAgg[0]?.total || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await PortfolioSnapshot.findOneAndUpdate(
    { userId, date: today },
    {
      $set: {
        userId,
        date: today,
        baseCurrency: BASE_CURRENCY,
        totalValueBase,
        totalCostBase,
        positionCount: positions.length,
        realizedGainYTD,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return true;
}

export async function captureSnapshotsForAllUsers(): Promise<{
  processed: number;
  captured: number;
}> {
  await connectDB();
  const users = await User.find().select("_id").lean();
  let captured = 0;
  for (const u of users) {
    try {
      const ok = await captureSnapshotForUser(u._id);
      if (ok) captured += 1;
    } catch (e) {
      console.error("[snapshot] user", u._id, e instanceof Error ? e.message : e);
    }
  }
  return { processed: users.length, captured };
}
