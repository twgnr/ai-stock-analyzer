import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { NewsDigest } from "@/lib/models/NewsDigest";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const items = await NewsDigest.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  return NextResponse.json({
    items: items.map((d) => ({
      _id: String(d._id),
      headline: d.headline,
      summary: d.summary,
      periodDays: d.periodDays,
      tickerCount: d.perTicker?.length || 0,
      model: d.model,
      createdAt: d.createdAt,
    })),
  });
}
