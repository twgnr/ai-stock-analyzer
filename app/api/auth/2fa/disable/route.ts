import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  // Brute-Force-Schutz für den 6-stelligen TOTP-Code — ohne den wäre bei
  // 1M möglichen Codes ein Angreifer mit gekaperter Session + Passwort in
  // Minuten durch.
  const rl = rateLimit(`2fa-disable:${current.userId}:${getClientIp(req)}`, 5, 15 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: t("rateLimit.tooManyRetry", { seconds: rl.retryAfter }) },
      { status: 429 }
    );
  }

  const { password, code } = await req.json();
  if (!password || !code) {
    return NextResponse.json({ error: t("auth.passwordAndCodeRequired") }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(current._id);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: t("auth.twoFactorNotActive") }, { status: 400 });
  }

  const pwOk = await verifyPassword(password, user.passwordHash);
  if (!pwOk) return NextResponse.json({ error: t("auth.passwordWrong") }, { status: 401 });

  if (!(await verifyTotp(code, user.totpSecret))) {
    return NextResponse.json({ error: t("auth.twoFactorWrong") }, { status: 401 });
  }

  user.totpEnabled = false;
  user.totpSecret = undefined;
  await user.save();
  return NextResponse.json({ ok: true });
}
