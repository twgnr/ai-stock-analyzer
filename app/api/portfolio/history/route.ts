import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PortfolioSnapshot } from "@/lib/models/PortfolioSnapshot";
import { getCurrentUser } from "@/lib/auth";
import { captureSnapshotForUser } from "@/lib/snapshotService";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const days = parseInt(req.nextUrl.searchParams.get("days") || "180");
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const snapshots = await PortfolioSnapshot.find({
    userId: user._id,
    date: { $gte: from },
  })
    .sort({ date: 1 })
    .lean();

  return NextResponse.json({
    snapshots: snapshots.map((s) => ({
      date: s.date,
      totalValueBase: s.totalValueBase,
      totalCostBase: s.totalCostBase,
      positionCount: s.positionCount,
      realizedGainYTD: s.realizedGainYTD || 0,
      baseCurrency: s.baseCurrency,
    })),
  });
}

export async function POST() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const captured = await captureSnapshotForUser(user._id);
  return NextResponse.json({ captured });
}
