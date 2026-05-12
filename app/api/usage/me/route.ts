import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserCostWindows } from "@/lib/usage";
import { getAppSettings } from "@/lib/models/AppSettings";
import { hasAnyAIAccess, buildAIConfig } from "@/lib/ai/factory";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * Liefert dem eingeloggten User Info über:
 *  - seine eigenen KI-Kosten heute + diesen Monat
 *  - ob er aktuell einen eigenen Key hat (source=user) oder den Shared-Key nutzen würde
 *  - die vom Admin konfigurierten Kostenlimits (wichtig wenn Shared aktiv)
 */
export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const [usage, settings] = await Promise.all([
    getUserCostWindows(user._id),
    getAppSettings(),
  ]);
  const ai = settings.ai || {};
  const userCfg = buildAIConfig(user);
  const hasOwnKey = userCfg !== null;
  const hasAccess = await hasAnyAIAccess(user, user._id);

  const daily = ai.dailyCostLimitUsd ?? 0;
  const monthly = ai.monthlyCostLimitUsd ?? 0;

  return NextResponse.json({
    usage: {
      dayUsd: usage.dayUsd,
      monthUsd: usage.monthUsd,
      dayStart: usage.dayStart,
      monthStart: usage.monthStart,
    },
    access: {
      hasOwnKey,
      hasAnyAccess: hasAccess,
      activeSource: hasOwnKey
        ? "user"
        : ai.allowSharedKeyUsage && (ai.claudeApiKey || ai.geminiApiKey || ai.openaiApiKey)
          ? "shared"
          : "none",
    },
    sharedLimits: {
      sharedKeyAvailable:
        !!(ai.claudeApiKey || ai.geminiApiKey || ai.openaiApiKey),
      allowSharedKeyUsage: !!ai.allowSharedKeyUsage,
      dailyLimitUsd: daily,
      monthlyLimitUsd: monthly,
      dayRemainingUsd: daily > 0 ? Math.max(0, daily - usage.dayUsd) : null,
      monthRemainingUsd:
        monthly > 0 ? Math.max(0, monthly - usage.monthUsd) : null,
    },
  });
}
