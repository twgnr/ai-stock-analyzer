import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { EmailVerificationToken } from "@/lib/models/EmailVerificationToken";
import { getCurrentUser, generateToken } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getApiTranslations, getEmailTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  if (current.emailVerified) {
    return NextResponse.json({ error: t("auth.emailAlreadyVerified") }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = rateLimit(`resend-verify:${current.userId}:${ip}`, 3, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: t("rateLimit.tooManyRequests", { seconds: rl.retryAfter }) },
      { status: 429 }
    );
  }

  await connectDB();
  const user = await User.findById(current.userId);
  if (!user) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  await EmailVerificationToken.deleteMany({ userId: user._id, used: false });
  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await EmailVerificationToken.create({ token, userId: user._id, expiresAt, used: false });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email/${token}`;
  const tMail = await getEmailTranslations(user.locale);
  const greeting = user.name
    ? tMail("verifyEmail.greetingNamed", { name: user.name })
    : tMail("verifyEmail.greetingPlain");
  const text = [
    greeting,
    "",
    tMail("verifyEmail.introResend"),
    "",
    verifyUrl,
    "",
    tMail("common.signature"),
  ].join("\n");
  await sendMail({ to: user.email, subject: tMail("verifyEmail.subject"), text });

  return NextResponse.json({ ok: true });
}
