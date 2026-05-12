import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { UsageLog } from "@/lib/models/UsageLog";
import { requireAdmin, AuthError } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiError";
import { Types } from "mongoose";

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();

    const users = await User.find()
      .select(
        "email name role emailVerified approved baseCurrency claudeApiKey lastLoginAt createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    const userIds = users.map((u) => u._id);
    const cutoffMonth = new Date();
    cutoffMonth.setDate(1);
    cutoffMonth.setHours(0, 0, 0, 0);

    const usageStats = await UsageLog.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: "$userId",
          totalTokensIn: { $sum: "$inputTokens" },
          totalTokensOut: { $sum: "$outputTokens" },
          totalCost: { $sum: "$estimatedCostUSD" },
          callCount: { $sum: 1 },
          costThisMonth: {
            $sum: {
              $cond: [{ $gte: ["$createdAt", cutoffMonth] }, "$estimatedCostUSD", 0],
            },
          },
        },
      },
    ]);

    const statsMap = new Map(usageStats.map((s) => [String(s._id), s]));

    const result = users.map((u) => {
      const stats = statsMap.get(String(u._id));
      return {
        _id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        emailVerified: u.emailVerified,
        approved: u.approved !== false,
        baseCurrency: u.baseCurrency,
        hasClaudeKey: !!u.claudeApiKey,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        usage: {
          inputTokens: stats?.totalTokensIn || 0,
          outputTokens: stats?.totalTokensOut || 0,
          totalCostUSD: stats?.totalCost || 0,
          callCount: stats?.callCount || 0,
          costThisMonthUSD: stats?.costThisMonth || 0,
        },
      };
    });

    return NextResponse.json({ users: result });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return apiErrorResponse(e);
  }
}
