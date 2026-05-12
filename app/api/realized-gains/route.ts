import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RealizedGain } from "@/lib/models/RealizedGain";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const year = req.nextUrl.searchParams.get("year");
  const filter: Record<string, unknown> = { userId: user._id };
  if (year) {
    const y = parseInt(year);
    filter.saleDate = {
      $gte: new Date(y, 0, 1),
      $lt: new Date(y + 1, 0, 1),
    };
  }

  const [gains, totals] = await Promise.all([
    RealizedGain.find(filter).sort({ saleDate: -1 }).lean(),
    RealizedGain.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: { $year: "$saleDate" },
          total: { $sum: "$gainBase" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]),
  ]);

  return NextResponse.json({
    gains: gains.map((g) => ({
      ...g,
      _id: String(g._id),
      transactionId: String(g.transactionId),
    })),
    yearlyTotals: totals.map((t) => ({ year: t._id, total: t.total, count: t.count })),
  });
}
