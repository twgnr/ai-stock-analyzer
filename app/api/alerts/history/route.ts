import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PriceAlert } from "@/lib/models/PriceAlert";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const alerts = await PriceAlert.find({
    userId: user._id,
    triggeredAt: { $exists: true, $ne: null },
  })
    .sort({ triggeredAt: -1 })
    .lean();

  return NextResponse.json({
    items: alerts.map((a) => ({
      _id: String(a._id),
      ticker: a.ticker,
      type: a.type || "price",
      direction: a.direction,
      threshold: a.threshold,
      currency: a.currency,
      indicatorCondition: a.indicatorCondition,
      triggeredAt: a.triggeredAt,
      createdAt: a.createdAt,
      notes: a.notes,
    })),
  });
}
