import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { User } from "@/lib/models/User";
import { connectDB } from "@/lib/mongodb";
import { getEmailTranslations, getRequestLocale } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { to } = await req.json().catch(() => ({}));
    const target = to || admin.email;
    // Sprache: bei Standard-Empfänger (Admin selbst) nutze sein User-Locale,
    // bei beliebigem Empfänger die aktuelle Request-Locale (Admin tippt
    // einen Test).
    let locale: string | undefined;
    if (!to) {
      await connectDB();
      const adminDoc = await User.findById(admin.userId).select("locale").lean();
      locale = adminDoc?.locale;
    } else {
      locale = await getRequestLocale();
    }
    const tMail = await getEmailTranslations(locale);
    const result = await sendMail({
      to: target,
      subject: tMail("testEmail.subject"),
      text: tMail("testEmail.body", { email: admin.email, time: new Date().toISOString() }),
    });
    return NextResponse.json({
      to: target,
      sent: result.sent,
      smtpConfigured: result.sent,
      fallbackMessage: result.sent
        ? null
        : "SMTP nicht konfiguriert — die Mail steht in der Server-Console.",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
