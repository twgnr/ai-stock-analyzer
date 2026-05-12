import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { UsageLog } from "@/lib/models/UsageLog";
import { requireAdmin, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();

    const cutoff30Days = new Date();
    cutoff30Days.setDate(cutoff30Days.getDate() - 30);

    const [byOperation, byUser, recentActivity] = await Promise.all([
      UsageLog.aggregate([
        { $match: { createdAt: { $gte: cutoff30Days } } },
        {
          $group: {
            _id: "$operation",
            count: { $sum: 1 },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            cost: { $sum: "$estimatedCostUSD" },
          },
        },
        { $sort: { cost: -1 } },
      ]),
      UsageLog.aggregate([
        { $match: { createdAt: { $gte: cutoff30Days } } },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            cost: { $sum: "$estimatedCostUSD" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            email: "$user.email",
            name: "$user.name",
            count: 1,
            inputTokens: 1,
            outputTokens: 1,
            cost: 1,
          },
        },
        { $sort: { cost: -1 } },
      ]),
      UsageLog.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("userId", "email name")
        .lean(),
    ]);

    return NextResponse.json({
      byOperation,
      byUser,
      recentActivity: recentActivity.map((r) => ({
        _id: String(r._id),
        userEmail:
          typeof r.userId === "object" && r.userId && "email" in r.userId
            ? (r.userId as { email: string }).email
            : null,
        operation: r.operation,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        estimatedCostUSD: r.estimatedCostUSD,
        success: r.success,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
