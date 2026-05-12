import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { runAutoUpdate } from "@/lib/autoUpdateService";

/**
 * Manueller Trigger des Auto-Update-Laufs durch den Admin. Umgeht das
 * Intervall-Gating (`force=true`), sodass der Admin „jetzt sofort" ausführen
 * kann ohne den Cron-Tick abzuwarten.
 */
export async function POST() {
  try {
    await requireAdmin();
    const result = await runAutoUpdate(true);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
