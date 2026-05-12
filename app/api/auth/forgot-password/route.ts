import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { PasswordResetToken } from "@/lib/models/PasswordResetToken";
import { generateToken } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getApiTranslations, getEmailTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const ip = getClientIp(req);
  const rl = rateLimit(`forgot:${ip}`, 5, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: t("rateLimit.tooManyRequests", { seconds: rl.retryAfter }) },
      { status: 429 }
    );
  }

  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: t("auth.emailRequired") }, { status: 400 });
  }

  await connectDB();
  const normalizedEmail = String(email).trim().toLowerCase();

  const emailLimit = rateLimit(`forgot-email:${normalizedEmail}`, 3, 60 * 60);
  if (!emailLimit.allowed) {
    return NextResponse.json({ ok: true });
  }

  // Der eigentliche Reset läuft im Hintergrund — wir warten nicht darauf.
  // Dadurch ist die Response-Zeit unabhängig davon, ob der User existiert
  // (DB-Write + Mail-Send vs. Nichts-Tun). Enumeration via Timing wird so
  // zuverlässig verhindert.
  (async () => {
    try {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) return;
      await PasswordResetToken.deleteMany({ userId: user._id, used: false });
      const token = generateToken(48);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await PasswordResetToken.create({ token, userId: user._id, expiresAt, used: false });

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password/${token}`;

      const tMail = await getEmailTranslations(user.locale);
      const greeting = tMail("resetPassword.greeting");
      const intro = tMail("resetPassword.intro");
      const ctaLine = tMail("resetPassword.ctaLine");
      const ignoreLine = tMail("resetPassword.ignore");
      const signature = tMail("common.signature");

      const text = [greeting, "", intro, "", ctaLine, resetUrl, "", ignoreLine, "", signature].join("\n");

      const html = `<p>${greeting}</p>
<p>${intro}</p>
<p>${ctaLine}</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>${ignoreLine}</p>
<p>${signature}</p>`;

      await sendMail({ to: user.email, subject: tMail("resetPassword.subject"), text, html });
    } catch (e) {
      console.error("[forgot-password] background error", e instanceof Error ? e.message : e);
    }
  })();

  return NextResponse.json({ ok: true });
}
