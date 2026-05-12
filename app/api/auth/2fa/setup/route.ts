import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth";
import { generateSecret, buildOtpAuthUrl, generateQrDataUrl, verifyTotp } from "@/lib/totp";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const secret = generateSecret();
  const otpauthUrl = buildOtpAuthUrl(current.email, secret);
  const qrDataUrl = await generateQrDataUrl(otpauthUrl);

  await connectDB();
  await User.updateOne(
    { _id: current._id, totpEnabled: false },
    { $set: { totpSecret: secret } }
  );

  return NextResponse.json({
    secret,
    qrDataUrl,
    otpauthUrl,
  });
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: t("auth.twoFactorCodeMissing") }, { status: 400 });

  await connectDB();
  const user = await User.findById(current._id);
  if (!user || !user.totpSecret) {
    return NextResponse.json({ error: t("auth.twoFactorSetupMissing") }, { status: 400 });
  }

  if (!(await verifyTotp(code, user.totpSecret))) {
    return NextResponse.json({ error: t("auth.twoFactorWrongRetry") }, { status: 400 });
  }

  user.totpEnabled = true;
  await user.save();
  return NextResponse.json({ ok: true });
}
