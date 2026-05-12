import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { verifyPassword, signSessionToken, setSessionCookie } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyTotp } from "@/lib/totp";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const ip = getClientIp(req);
  const rl = rateLimit(`login:${ip}`, 8, 15 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: t("rateLimit.loginThrottled", { seconds: rl.retryAfter }),
      },
      { status: 429 }
    );
  }

  const { email, password, totpCode } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: t("auth.emailPasswordRequired") }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) {
    return NextResponse.json({ error: t("auth.credentialsInvalid") }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: t("auth.credentialsInvalid") }, { status: 401 });
  }

  // 2FA-Check nach erfolgreichem Passwort-Check. Erst ab hier weiß der Client,
  // dass überhaupt ein 2FA-Code benötigt wird — so leakt die 2FA-Aktivierung
  // nicht an nicht-authentisierte Angreifer.
  if (user.totpEnabled && user.totpSecret) {
    if (typeof totpCode !== "string" || totpCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: t("auth.twoFactorRequired"),
          requiresTotp: true,
        },
        { status: 401 }
      );
    }
    const validTotp = await verifyTotp(totpCode, user.totpSecret);
    if (!validTotp) {
      return NextResponse.json(
        {
          error: t("auth.twoFactorInvalid"),
          requiresTotp: true,
        },
        { status: 401 }
      );
    }
  }

  if (user.approved === false) {
    return NextResponse.json(
      {
        error: t("auth.pendingApproval"),
        pendingApproval: true,
      },
      { status: 403 }
    );
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signSessionToken({ userId: String(user._id), email: user.email });
  await setSessionCookie(token);

  return NextResponse.json({
    _id: String(user._id),
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    hasClaudeKey: !!user.claudeApiKey,
    role: user.role,
    emailVerified: user.emailVerified,
  });
}
