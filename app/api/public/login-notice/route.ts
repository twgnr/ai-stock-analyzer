import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getAppSettings } from "@/lib/models/AppSettings";

/**
 * Öffentlich erreichbarer Endpoint: Liefert den vom Admin hinterlegten
 * Hinweistext für die Login-Seite. Kein Auth-Check — muss in der Middleware
 * als Public-Path eingetragen sein.
 */
export async function GET() {
  try {
    await connectDB();
    const s = await getAppSettings();
    const enabled = !!s.loginNoticeEnabled;
    const text = enabled ? (s.loginNoticeText || "").trim() : "";
    return NextResponse.json({ enabled: enabled && text.length > 0, text });
  } catch {
    // Bei Fehlern stumm zurückgeben — der Hinweis ist optional.
    return NextResponse.json({ enabled: false, text: "" });
  }
}

export const runtime = "nodejs";
