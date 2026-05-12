import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rebuildSharedSnapshot } from "@/lib/dividendScreener";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * POST /api/dividends/screener/scan — triggert einen Komplett-Rebuild der
 * kuratierten Dividend-Liste. Das Ergebnis wird für alle User gespeichert.
 * Solange ein Scan läuft (oder der letzte <10 Min alt ist ohne Abschluss),
 * wird 409 Conflict zurückgeliefert.
 */
export async function POST() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const result = await rebuildSharedSnapshot({
    email: user.email,
    name: user.name,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason || "Scan fehlgeschlagen" },
      { status: 409 }
    );
  }
  return NextResponse.json({
    ok: true,
    snapshot: {
      scannedAt: result.snapshot!.scannedAt,
      universeSize: result.snapshot!.universeSize,
      scanDurationMs: result.snapshot!.scanDurationMs,
      sharedRowCount: result.snapshot!.rows.length,
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 120;
