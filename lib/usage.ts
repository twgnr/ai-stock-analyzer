import { Types } from "mongoose";
import { connectDB } from "./mongodb";
import { UsageLog } from "./models/UsageLog";

export type UsageWindow = "day" | "month";

function windowStart(window: UsageWindow): Date {
  const d = new Date();
  if (window === "day") {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

/**
 * Summe der geschätzten KI-Kosten eines Users im aktuellen Zeitfenster
 * (Tag oder Monat, UTC-basiert). Quelle: UsageLog, das pro KI-Call
 * geschrieben wird.
 */
export async function getUserCostInWindow(
  userId: Types.ObjectId | string,
  window: UsageWindow
): Promise<number> {
  await connectDB();
  const start = windowStart(window);
  const agg = await UsageLog.aggregate([
    { $match: { userId: new Types.ObjectId(String(userId)), createdAt: { $gte: start } } },
    { $group: { _id: null, total: { $sum: "$estimatedCostUSD" } } },
  ]);
  return agg[0]?.total ?? 0;
}

export interface UserCostWindows {
  dayUsd: number;
  monthUsd: number;
  dayStart: Date;
  monthStart: Date;
}

export async function getUserCostWindows(
  userId: Types.ObjectId | string
): Promise<UserCostWindows> {
  const dayStart = windowStart("day");
  const monthStart = windowStart("month");
  const [dayUsd, monthUsd] = await Promise.all([
    getUserCostInWindow(userId, "day"),
    getUserCostInWindow(userId, "month"),
  ]);
  return { dayUsd, monthUsd, dayStart, monthStart };
}
