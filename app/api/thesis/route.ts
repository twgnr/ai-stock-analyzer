import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  const filter: { userId: typeof user._id; ticker?: string } = { userId: user._id };
  if (ticker) filter.ticker = ticker;

  const list = await InvestmentThesis.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(
    list.map((t) => ({ ...t, _id: String(t._id), userId: String(t.userId) }))
  );
}

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  const body = await req.json();
  const ticker = String(body.ticker || "").toUpperCase();
  const thesis = String(body.thesis || "").trim();
  if (!ticker) return NextResponse.json({ error: tr("validation.tickerMissing") }, { status: 400 });
  if (!thesis) return NextResponse.json({ error: tr("validation.thesisMissing") }, { status: 400 });

  await connectDB();
  const created = await InvestmentThesis.create({
    userId: user._id,
    ticker,
    thesis,
    exitCriteria: body.exitCriteria,
    expectedHorizonMonths: body.expectedHorizonMonths,
    priceAtEntry: body.priceAtEntry,
    currency: body.currency,
    status: "ACTIVE",
  });

  return NextResponse.json({ ...created.toObject(), _id: String(created._id) }, { status: 201 });
}
