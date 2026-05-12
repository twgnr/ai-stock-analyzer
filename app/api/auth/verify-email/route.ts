import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { EmailVerificationToken } from "@/lib/models/EmailVerificationToken";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: t("auth.tokenMissing") }, { status: 400 });

  await connectDB();
  const record = await EmailVerificationToken.findOne({ token, used: false });
  if (!record) {
    return NextResponse.json({ error: t("auth.tokenInvalid") }, { status: 400 });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: t("auth.tokenExpired") }, { status: 400 });
  }

  const user = await User.findById(record.userId);
  if (!user) return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });

  user.emailVerified = true;
  await user.save();
  record.used = true;
  await record.save();

  return NextResponse.json({ ok: true, email: user.email });
}
