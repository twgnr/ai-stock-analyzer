import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const items = await Watchlist.find({ userId: user._id }).sort({ ticker: 1 }).lean();
  return NextResponse.json(items.map((w) => ({ ...w, _id: String(w._id) })));
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { ticker, name, notes } = await req.json();
  if (!ticker) {
    return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  }
  const normalized = String(ticker).toUpperCase().trim();
  try {
    const created = await Watchlist.findOneAndUpdate(
      { userId: user._id, ticker: normalized },
      { $set: { userId: user._id, ticker: normalized, name, notes } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return NextResponse.json({ ...created, _id: String(created!._id) }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
