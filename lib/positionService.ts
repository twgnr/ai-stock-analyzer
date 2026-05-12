import { connectDB } from "./mongodb";
import { Transaction } from "./models/Transaction";
import { Position } from "./models/Position";
import { RealizedGain } from "./models/RealizedGain";
import { getRates, BASE_CURRENCY } from "./fx";
import type { Types } from "mongoose";

export async function rebuildPosition(
  userId: Types.ObjectId | string,
  ticker: string
): Promise<void> {
  await connectDB();
  const normalized = ticker.toUpperCase();
  const txs = await Transaction.find({
    userId,
    ticker: normalized,
    type: { $in: ["buy", "sell"] },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  if (txs.length === 0) {
    await Position.deleteOne({ userId, ticker: normalized });
    return;
  }

  let shares = 0;
  let totalCost = 0;
  let currency = "EUR";
  let name: string | undefined;

  for (const tx of txs) {
    currency = tx.currency;
    if (tx.type === "buy") {
      shares += tx.shares;
      totalCost += tx.shares * tx.price + (tx.fees || 0);
    } else if (tx.type === "sell") {
      if (shares > 0) {
        const avg = totalCost / shares;
        const soldCost = avg * tx.shares;
        totalCost -= soldCost;
      }
      shares -= tx.shares;
      if (shares < 0) shares = 0;
      if (totalCost < 0) totalCost = 0;
    }
  }

  if (shares <= 0) {
    await Position.deleteOne({ userId, ticker: normalized });
    return;
  }

  const avgPrice = totalCost / shares;

  await Position.findOneAndUpdate(
    { userId, ticker: normalized },
    {
      $set: {
        userId,
        ticker: normalized,
        shares,
        avgPrice,
        currency,
        name,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function recordRealizedGain(
  userId: Types.ObjectId | string,
  ticker: string,
  sellTx: {
    _id: Types.ObjectId;
    shares: number;
    price: number;
    currency: string;
    date: Date;
  }
): Promise<void> {
  await connectDB();
  const normalized = ticker.toUpperCase();

  const priorBuys = await Transaction.find({
    userId,
    ticker: normalized,
    type: { $in: ["buy", "sell"] },
    _id: { $ne: sellTx._id },
    date: { $lte: sellTx.date },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  let shares = 0;
  let totalCost = 0;
  for (const tx of priorBuys) {
    if (tx.type === "buy") {
      shares += tx.shares;
      totalCost += tx.shares * tx.price + (tx.fees || 0);
    } else if (tx.type === "sell") {
      if (shares > 0) {
        const avg = totalCost / shares;
        totalCost -= avg * tx.shares;
      }
      shares -= tx.shares;
    }
  }
  if (shares <= 0) return;
  const avgBuy = totalCost / shares;
  const gainNative = (sellTx.price - avgBuy) * sellTx.shares;

  const rates = await getRates([sellTx.currency], BASE_CURRENCY);
  const fxRate =
    sellTx.currency === BASE_CURRENCY ? 1 : rates[sellTx.currency.toUpperCase()] ?? 0;
  const gainBase = gainNative * fxRate;

  await RealizedGain.create({
    userId,
    ticker: normalized,
    shares: sellTx.shares,
    avgBuyPrice: avgBuy,
    sellPrice: sellTx.price,
    currency: sellTx.currency,
    gainBase,
    baseCurrency: BASE_CURRENCY,
    fxRate,
    saleDate: sellTx.date,
    transactionId: sellTx._id,
  });
}
