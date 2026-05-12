import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConfiguredProviders } from "@/lib/ai/factory";
import { PROVIDER_LABELS } from "@/lib/ai/types";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * Welche KI-Provider hat dieser User konfiguriert? Wird vom UI für die
 * Cost-Estimate-Badge benutzt — wir wollen wissen, gegen welche
 * Modelle/Anbieter wir die Schätzung rechnen.
 */
export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const configs = getConfiguredProviders(user);
  return NextResponse.json({
    providers: configs.map((c) => ({
      provider: c.provider,
      model: c.model,
      label: PROVIDER_LABELS[c.provider],
    })),
  });
}
