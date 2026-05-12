import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth";
import { VALID_NAV_HREFS } from "@/lib/navCatalog";
import { getApiTranslations } from "@/lib/i18n-server";

// Muss mit `WidgetId` in app/page.tsx synchron bleiben.
const VALID_WIDGET_IDS = new Set<string>([
  "favorites",
  "stats",
  "performance",
  "health",
  "movers",
  "sentiment",
  "sectorHeatmap",
  "positions",
  "aiAnalysis",
]);

const MAX_FAVORITES = 24;

export async function GET() {
  const t = await getApiTranslations();
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const user = await User.findById(session.userId).lean<{
    dashboardWidgets?: { id: string; visible: boolean }[];
    favoriteSections?: string[];
  }>();
  if (!user) return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });

  return NextResponse.json({
    dashboardWidgets: Array.isArray(user.dashboardWidgets)
      ? user.dashboardWidgets
          .filter(
            (w) =>
              w &&
              typeof w.id === "string" &&
              VALID_WIDGET_IDS.has(w.id)
          )
          .map((w) => ({ id: w.id, visible: w.visible !== false }))
      : [],
    favoriteSections: Array.isArray(user.favoriteSections)
      ? user.favoriteSections.filter(
          (h): h is string => typeof h === "string" && VALID_NAV_HREFS.has(h)
        )
      : [],
  });
}

export async function PATCH(req: NextRequest) {
  const t = await getApiTranslations();
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const body = await req.json();
  await connectDB();
  const user = await User.findById(session.userId);
  if (!user) return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });

  if (Array.isArray(body.dashboardWidgets)) {
    const seen = new Set<string>();
    const cleaned: { id: string; visible: boolean }[] = [];
    for (const w of body.dashboardWidgets) {
      if (
        w &&
        typeof w === "object" &&
        typeof (w as { id?: unknown }).id === "string" &&
        VALID_WIDGET_IDS.has((w as { id: string }).id) &&
        !seen.has((w as { id: string }).id)
      ) {
        const item = w as { id: string; visible?: unknown };
        seen.add(item.id);
        cleaned.push({ id: item.id, visible: item.visible !== false });
      }
    }
    user.dashboardWidgets = cleaned;
  }

  if (Array.isArray(body.favoriteSections)) {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const h of body.favoriteSections) {
      if (typeof h !== "string") continue;
      if (!VALID_NAV_HREFS.has(h)) continue;
      if (seen.has(h)) continue;
      if (cleaned.length >= MAX_FAVORITES) break;
      seen.add(h);
      cleaned.push(h);
    }
    user.favoriteSections = cleaned;
  }

  await user.save();
  return NextResponse.json({ ok: true });
}
