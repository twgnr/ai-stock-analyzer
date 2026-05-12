import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { UsageLog } from "@/lib/models/UsageLog";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const cutoff30Days = new Date();
  cutoff30Days.setDate(cutoff30Days.getDate() - 30);

  const [total, thisMonth, byOperation] = await Promise.all([
    UsageLog.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          cost: { $sum: "$estimatedCostUSD" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
    ]),
    UsageLog.aggregate([
      { $match: { userId: user._id, createdAt: { $gte: cutoff30Days } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          cost: { $sum: "$estimatedCostUSD" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
    ]),
    UsageLog.aggregate([
      { $match: { userId: user._id, createdAt: { $gte: cutoff30Days } } },
      {
        $group: {
          _id: "$operation",
          count: { $sum: 1 },
          cost: { $sum: "$estimatedCostUSD" },
        },
      },
      { $sort: { cost: -1 } },
    ]),
  ]);

  return NextResponse.json({
    total: total[0] || { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
    last30Days: thisMonth[0] || { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
    byOperation,
  });
}
