import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/lib/models/Transaction";
import { getCurrentUser } from "@/lib/auth";
import { rebuildPosition, recordRealizedGain } from "@/lib/positionService";
import { getQuote } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const ticker = req.nextUrl.searchParams.get("ticker");
  const type = req.nextUrl.searchParams.get("type");
  const filter: Record<string, unknown> = { userId: user._id };
  if (ticker) filter.ticker = ticker.toUpperCase();
  if (type) filter.type = type;
  const transactions = await Transaction.find(filter).sort({ date: -1, createdAt: -1 }).lean();
  return NextResponse.json(
    transactions.map((t) => ({ ...t, _id: String(t._id), userId: String(t.userId) }))
  );
}

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { ticker, type, shares, price, amount, currency, fees, date, notes } = body;

  if (!ticker || !type) {
    return NextResponse.json({ error: tr("validation.tickerTypeRequired") }, { status: 400 });
  }
  if (!["buy", "sell", "dividend", "fee"].includes(type)) {
    return NextResponse.json({ error: tr("validation.invalidTransactionType") }, { status: 400 });
  }

  const normalized = String(ticker).toUpperCase().trim();
  let resolvedCurrency = (currency || "EUR").toUpperCase();

  if (!resolvedCurrency || resolvedCurrency === "EUR") {
    try {
      const quote = await getQuote(normalized);
      if (quote.currency) resolvedCurrency = quote.currency.toUpperCase();
    } catch {
      // ignore
    }
  }

  const txDate = date ? new Date(date) : new Date();
  const numShares = Number(shares) || 0;
  const numPrice = Number(price) || 0;
  const numFees = Number(fees) || 0;
  const numAmount = amount != null ? Number(amount) : undefined;

  if ((type === "buy" || type === "sell") && (!(numShares > 0) || !(numPrice > 0))) {
    return NextResponse.json(
      { error: "Bei Kauf/Verkauf: shares und price müssen > 0 sein" },
      { status: 400 }
    );
  }
  if (type === "dividend" && !(numAmount && numAmount > 0)) {
    return NextResponse.json(
      { error: "Bei Dividende: amount muss > 0 sein" },
      { status: 400 }
    );
  }

  const tx = await Transaction.create({
    userId: user._id,
    ticker: normalized,
    type,
    shares: numShares,
    price: numPrice,
    amount: numAmount,
    currency: resolvedCurrency,
    fees: numFees,
    date: txDate,
    notes,
  });

  if (type === "buy" || type === "sell") {
    if (type === "sell") {
      try {
        await recordRealizedGain(user._id, normalized, {
          _id: tx._id,
          shares: numShares,
          price: numPrice,
          currency: resolvedCurrency,
          date: txDate,
        });
      } catch (e) {
        console.error("[realized-gain]", e);
      }
    }
    await rebuildPosition(user._id, normalized);
  }

  return NextResponse.json(
    { ...tx.toObject(), _id: String(tx._id), userId: String(tx.userId) },
    { status: 201 }
  );
}
