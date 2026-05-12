import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPublicKey, isPushConfigured } from "@/lib/webPush";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  // Kein 503: das ist kein „Fehler", sondern ein Konfigurations-Zustand. Ein
  // 503 würde im Browser-Devtools-Network-Tab als roter Eintrag landen und
  // bei wiederholten Aufrufen Console-Spam erzeugen. Ein 200 mit
  // `publicKey: null` lässt sich genauso behandeln, ohne Lärm.
  if (!isPushConfigured()) {
    return NextResponse.json({ publicKey: null, configured: false });
  }
  return NextResponse.json({ publicKey: getPublicKey(), configured: true });
}
