import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getQuote } from "@/lib/yahoo";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const positions = await Position.find({ userId: user._id }).sort({ ticker: 1 }).lean();
  return NextResponse.json(
    positions.map((p) => ({ ...p, _id: String(p._id), userId: String(p.userId) }))
  );
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { ticker, name, shares, avgPrice, currency, notes } = body;

  if (!ticker || typeof shares !== "number" || typeof avgPrice !== "number") {
    return NextResponse.json({ error: t("validation.tickerSharesAvgPriceRequired") }, { status: 400 });
  }

  const normalized = String(ticker).toUpperCase().trim();
  const purchaseCurrency = (currency || "EUR").toUpperCase();

  let resolvedName = name;
  if (!resolvedName) {
    try {
      const quote = await getQuote(normalized);
      resolvedName = quote.name;
    } catch {
      // ignore
    }
  }

  const existing = await Position.findOne({ userId: user._id, ticker: normalized });

  if (existing) {
    if (existing.currency.toUpperCase() !== purchaseCurrency) {
      return NextResponse.json(
        {
          error: `Diese Position existiert bereits in ${existing.currency}. Zusammenführen nur in derselben Kaufwährung möglich.`,
        },
        { status: 400 }
      );
    }
    const totalShares = existing.shares + shares;
    const weightedAvg =
      (existing.shares * existing.avgPrice + shares * avgPrice) / totalShares;
    existing.shares = totalShares;
    existing.avgPrice = weightedAvg;
    if (resolvedName) existing.name = resolvedName;
    if (notes) existing.notes = notes;
    await existing.save();
    return NextResponse.json({ ...existing.toObject(), _id: String(existing._id) });
  }

  const created = await Position.create({
    userId: user._id,
    ticker: normalized,
    name: resolvedName,
    shares,
    avgPrice,
    currency: purchaseCurrency,
    notes,
  });
  return NextResponse.json({ ...created.toObject(), _id: String(created._id) }, { status: 201 });
}
