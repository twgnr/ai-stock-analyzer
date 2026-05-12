import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { PasswordResetToken } from "@/lib/models/PasswordResetToken";
import { hashPassword, signSessionToken, setSessionCookie } from "@/lib/auth";
import { checkPasswordStrength } from "@/lib/passwordPolicy";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const { token, password } = await req.json();
  if (!token || !password) {
    return NextResponse.json({ error: t("auth.tokenPasswordRequired") }, { status: 400 });
  }

  await connectDB();
  const record = await PasswordResetToken.findOne({ token, used: false });
  if (!record) {
    return NextResponse.json({ error: t("auth.tokenInvalid") }, { status: 400 });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: t("auth.tokenExpired") }, { status: 400 });
  }

  const user = await User.findById(record.userId);
  if (!user) {
    return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });
  }

  // Policy-Check erst hier, nachdem wir den User kennen — so kann der Check
  // das Passwort gegen den Namen/die E-Mail des Users prüfen.
  const pwCheck = checkPasswordStrength(password, {
    email: user.email,
    name: user.name,
  });
  if (!pwCheck.ok) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 });
  }

  user.passwordHash = await hashPassword(password);
  await user.save();

  record.used = true;
  await record.save();

  const sessionToken = signSessionToken({ userId: String(user._id), email: user.email });
  await setSessionCookie(sessionToken);

  return NextResponse.json({ ok: true });
}
