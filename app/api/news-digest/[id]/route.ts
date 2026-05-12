import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { NewsDigest } from "@/lib/models/NewsDigest";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const d = await NewsDigest.findById(id).lean();
  if (!d) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(d.userId) !== user.userId) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }

  return NextResponse.json({
    _id: String(d._id),
    headline: d.headline,
    summary: d.summary,
    marketOverview: d.marketOverview,
    perTicker: d.perTicker,
    upcomingEvents: d.upcomingEvents,
    watchNext: d.watchNext,
    periodDays: d.periodDays,
    tickers: d.tickers,
    model: d.model,
    mailedAt: d.mailedAt,
    createdAt: d.createdAt,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const d = await NewsDigest.findById(id);
  if (!d) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(d.userId) !== user.userId) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }
  await NewsDigest.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
