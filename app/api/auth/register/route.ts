import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getAppSettings } from "@/lib/models/AppSettings";
import { EmailVerificationToken } from "@/lib/models/EmailVerificationToken";
import {
  hashPassword,
  signSessionToken,
  setSessionCookie,
  generateToken,
} from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { checkPasswordStrength } from "@/lib/passwordPolicy";
import { getApiTranslations, getEmailTranslations, getRequestLocale } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, 3, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: t("rateLimit.registerThrottled", { seconds: rl.retryAfter }),
      },
      { status: 429 }
    );
  }

  const { email, password, name } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: t("auth.emailPasswordRequired") }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: t("auth.emailInvalid") }, { status: 400 });
  }
  const pwCheck = checkPasswordStrength(password, {
    email: String(email),
    name: typeof name === "string" ? name : undefined,
  });
  if (!pwCheck.ok) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 });
  }

  await connectDB();

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    // Keine "E-Mail bereits registriert"-Antwort mehr — das würde einem
    // Angreifer erlauben, Konten zu enumerieren. Stattdessen: gleiche
    // Response-Shape wie bei einer normalen Registrierung (ohne Session-
    // Cookie, ohne neuen User-Anlage) + Hinweis-Mail an den echten Inhaber.
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    // Mail an existierenden Inhaber — Sprache aus dessen User-Doc.
    const tMail = await getEmailTranslations(existing.locale);
    await sendMail({
      to: normalizedEmail,
      subject: tMail("registerAttempt.subject"),
      text: [
        tMail("registerAttempt.greeting"),
        "",
        tMail("registerAttempt.intro"),
        "",
        tMail("registerAttempt.resetHint", { url: `${appUrl}/forgot-password` }),
        "",
        tMail("common.signature"),
      ].join("\n"),
    }).catch(() => {
      // Silent — Enumeration-Schutz darf nicht an Mail-Fehlern hängen
    });
    return NextResponse.json({
      _id: "",
      email: normalizedEmail,
      name: undefined,
      baseCurrency: "EUR",
      role: "user",
      emailVerified: false,
      approved: false,
      pendingApproval: true,
    });
  }

  const passwordHash = await hashPassword(password);

  const anyAdmin = await User.findOne({ role: "admin" }).lean();
  const role = anyAdmin ? "user" : "admin";

  const settings = await getAppSettings();
  // Erster User (Admin) wird nie geblockt; sonst globale Einstellung prüfen
  const approved = role === "admin" ? true : !settings.requireApproval;

  // Beim Anlegen halten wir die Sprachpräferenz fest — Browser-Sprache zur
  // Registrierungszeit. Spätere E-Mails (Reset, Alerts, Digest) nutzen genau
  // diesen Wert, weil sie oft im Cron-Kontext ohne Request laufen.
  const initialLocale = await getRequestLocale();

  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    name: name?.trim() || undefined,
    baseCurrency: "EUR",
    role,
    emailVerified: false,
    approved,
    lastLoginAt: new Date(),
    locale: initialLocale,
  });

  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await EmailVerificationToken.create({ token, userId: user._id, expiresAt, used: false });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email/${token}`;
  const tMail = await getEmailTranslations(initialLocale);
  const greeting = user.name
    ? tMail("verifyEmail.greetingNamed", { name: user.name })
    : tMail("verifyEmail.greetingPlain");
  const text = [
    greeting,
    "",
    tMail("verifyEmail.intro"),
    "",
    verifyUrl,
    "",
    tMail("verifyEmail.ignore"),
    "",
    tMail("common.signature"),
  ].join("\n");
  await sendMail({
    to: user.email,
    subject: tMail("verifyEmail.subject"),
    text,
  });

  if (approved) {
    const sessionToken = signSessionToken({ userId: String(user._id), email: user.email });
    await setSessionCookie(sessionToken);
  }

  return NextResponse.json({
    _id: String(user._id),
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    role: user.role,
    emailVerified: user.emailVerified,
    approved: user.approved,
    pendingApproval: !approved,
  });
}
