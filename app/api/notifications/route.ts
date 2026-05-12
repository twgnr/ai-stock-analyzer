import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { PriceAlert } from "@/lib/models/PriceAlert";
import { Analysis } from "@/lib/models/Analysis";
import { getApiTranslations } from "@/lib/i18n-server";

interface NotificationItem {
  id: string;
  type: "alert" | "analysis";
  title: string;
  subtitle: string;
  href: string;
  /** Unix-ms */
  at: number;
}

interface NotificationsResponse {
  items: NotificationItem[];
}

const LOOKBACK_DAYS = 14;
const MAX_ITEMS = 15;

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  const [alerts, analyses] = await Promise.all([
    PriceAlert.find({
      userId: user._id,
      triggeredAt: { $gte: since },
    })
      .sort({ triggeredAt: -1 })
      .limit(MAX_ITEMS)
      .lean(),
    Analysis.find({
      kind: "single",
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_ITEMS)
      .lean(),
  ]);

  const items: NotificationItem[] = [];

  for (const a of alerts) {
    if (!a.triggeredAt) continue;
    items.push({
      id: `alert-${String(a._id)}`,
      type: "alert",
      title: alertTitle(a),
      subtitle: a.notes || "Alert ausgelöst",
      href: `/alerts/history`,
      at: new Date(a.triggeredAt).getTime(),
    });
  }

  for (const an of analyses) {
    items.push({
      id: `analysis-${String(an._id)}`,
      type: "analysis",
      title: `Analyse: ${an.ticker}${an.recommendation ? ` → ${an.recommendation}` : ""}`,
      subtitle: an.summary?.slice(0, 120) || "Neue KI-Analyse",
      href: `/analysis/${encodeURIComponent(an.ticker)}`,
      at: new Date(an.createdAt).getTime(),
    });
  }

  items.sort((a, b) => b.at - a.at);
  const trimmed = items.slice(0, MAX_ITEMS);

  const response: NotificationsResponse = { items: trimmed };
  return NextResponse.json(response);
}

function alertTitle(a: {
  ticker: string;
  type: string;
  direction?: string;
  threshold?: number;
  currency?: string;
  indicatorCondition?: string;
}): string {
  if (a.type === "indicator" && a.indicatorCondition) {
    return `${a.ticker}: ${a.indicatorCondition.replace(/_/g, " ")}`;
  }
  if (a.threshold != null && a.direction) {
    const arrow = a.direction === "above" ? "↑" : "↓";
    return `${a.ticker} ${arrow} ${a.threshold} ${a.currency || ""}`.trim();
  }
  return `${a.ticker}: Alert getriggert`;
}
