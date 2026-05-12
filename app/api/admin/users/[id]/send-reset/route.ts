import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { PasswordResetToken } from "@/lib/models/PasswordResetToken";
import { requireAdmin, AuthError, generateToken } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { getApiTranslations, getEmailTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const t = await getApiTranslations();
    await requireAdmin();
    await connectDB();
    const { id } = await params;
    const target = await User.findById(id);
    if (!target) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

    await PasswordResetToken.deleteMany({ userId: target._id, used: false });
    const token = generateToken(48);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await PasswordResetToken.create({ token, userId: target._id, expiresAt, used: false });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password/${token}`;
    const tMail = await getEmailTranslations(target.locale);
    const greeting = target.name
      ? tMail("resetPassword.greetingNamed", { name: target.name })
      : tMail("resetPassword.greeting");
    const text = [
      greeting,
      "",
      tMail("resetPassword.introAdmin"),
      "",
      tMail("resetPassword.ctaLine"),
      resetUrl,
      "",
      tMail("common.signature"),
    ].join("\n");

    const result = await sendMail({
      to: target.email,
      subject: tMail("resetPassword.subjectAdmin"),
      text,
    });

    return NextResponse.json({
      ok: true,
      mailSent: result.sent,
      resetUrlFallback: result.sent ? null : resetUrl,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
