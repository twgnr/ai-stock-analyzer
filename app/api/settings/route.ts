import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getCurrentUser, verifyPassword, hashPassword } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/secretCrypto";
import { validatePublicBaseUrl, validateOllamaBaseUrl } from "@/lib/urlSafety";
import { checkPasswordStrength } from "@/lib/passwordPolicy";
import { getApiTranslations } from "@/lib/i18n-server";

function keyPreview(key?: string): string | null {
  if (!key) return null;
  const plain = decryptSecret(key);
  if (!plain) return null;
  if (plain.length < 10) return `${plain.slice(0, 2)}…${plain.slice(-2)}`;
  return `${plain.slice(0, 10)}…${plain.slice(-4)}`;
}

export async function GET() {
  const t = await getApiTranslations();
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  // SessionUser hat nicht alle persistierten Felder (z. B. digestEnabled,
  // alertsEnabled, notificationEmail, totpEnabled) und liefert API-Keys
  // bereits entschlüsselt — keyPreview erwartet aber den verschlüsselten
  // Wert. Daher hier direkt das DB-Doc lesen.
  await connectDB();
  const user = await User.findById(session.userId).lean<{
    email: string;
    name?: string;
    baseCurrency?: string;
    aiProvider?: "claude" | "gemini" | "openai-compat" | "ollama";
    aiProviderOrder?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
    disabledAiProviders?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
    claudeApiKey?: string;
    claudeModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    digestEnabled?: boolean;
    alertsEnabled?: boolean;
    notificationEmail?: string;
    totpEnabled?: boolean;
    aiDisabled?: boolean;
    emailVerified?: boolean;
    locale?: "de" | "en";
  }>();
  if (!user) return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });

  return NextResponse.json({
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency || "EUR",
    aiProvider: user.aiProvider || "claude",
    aiProviderOrder: Array.isArray(user.aiProviderOrder)
      ? user.aiProviderOrder
      : [],
    disabledAiProviders: Array.isArray(user.disabledAiProviders)
      ? user.disabledAiProviders
      : [],

    claudeApiKey: !!user.claudeApiKey,
    claudeApiKeyPreview: keyPreview(user.claudeApiKey),
    claudeModel: user.claudeModel || "",

    geminiApiKey: !!user.geminiApiKey,
    geminiApiKeyPreview: keyPreview(user.geminiApiKey),
    geminiModel: user.geminiModel || "",

    openaiApiKey: !!user.openaiApiKey,
    openaiApiKeyPreview: keyPreview(user.openaiApiKey),
    openaiBaseUrl: user.openaiBaseUrl || "",
    openaiModel: user.openaiModel || "",

    ollamaBaseUrl: user.ollamaBaseUrl || "",
    ollamaModel: user.ollamaModel || "",
    // „Configured" für Ollama heißt: BaseUrl ist gesetzt (kein API-Key nötig).
    ollamaConfigured: !!user.ollamaBaseUrl,

    digestEnabled: !!user.digestEnabled,
    alertsEnabled: user.alertsEnabled !== false,
    notificationEmail: user.notificationEmail,
    totpEnabled: user.emailVerified ? !!user.totpEnabled : false,

    aiDisabled: !!user.aiDisabled,

    hasClaudeKey: !!user.claudeApiKey,

    locale: user.locale || "de",
  });
}

export async function PATCH(req: NextRequest) {
  const t = await getApiTranslations();
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const body = await req.json();
  await connectDB();
  const user = await User.findById(current.userId);
  if (!user) return NextResponse.json({ error: t("auth.userNotFound") }, { status: 404 });

  if (typeof body.name === "string") {
    user.name = body.name.trim() || undefined;
  }
  if (typeof body.baseCurrency === "string") {
    user.baseCurrency = body.baseCurrency.trim().toUpperCase();
  }
  if (typeof body.aiProvider === "string") {
    if (!["claude", "gemini", "openai-compat", "ollama"].includes(body.aiProvider)) {
      return NextResponse.json({ error: t("validation.unknownAiProvider") }, { status: 400 });
    }
    user.aiProvider = body.aiProvider;
  }

  if (Array.isArray(body.aiProviderOrder)) {
    const valid: ("claude" | "gemini" | "openai-compat" | "ollama")[] = [];
    const seen = new Set<string>();
    for (const p of body.aiProviderOrder) {
      if (
        typeof p === "string" &&
        ["claude", "gemini", "openai-compat", "ollama"].includes(p) &&
        !seen.has(p)
      ) {
        seen.add(p);
        valid.push(p as "claude" | "gemini" | "openai-compat" | "ollama");
      }
    }
    user.aiProviderOrder = valid;
    // aiProvider folgt der Order, damit das Magazin-"Standard"-Label und der
    // Resolver-Default sich nicht widersprechen.
    if (valid.length > 0) {
      user.aiProvider = valid[0];
    }
  }

  if (Array.isArray(body.disabledAiProviders)) {
    const valid: ("claude" | "gemini" | "openai-compat" | "ollama")[] = [];
    const seen = new Set<string>();
    for (const p of body.disabledAiProviders) {
      if (
        typeof p === "string" &&
        ["claude", "gemini", "openai-compat", "ollama"].includes(p) &&
        !seen.has(p)
      ) {
        seen.add(p);
        valid.push(p as "claude" | "gemini" | "openai-compat" | "ollama");
      }
    }
    user.disabledAiProviders = valid;
  }

  if (typeof body.claudeApiKey === "string") {
    const key = body.claudeApiKey.trim();
    if (key && !key.startsWith("sk-ant-")) {
      return NextResponse.json(
        { error: "Claude-Keys beginnen mit 'sk-ant-'" },
        { status: 400 }
      );
    }
    user.claudeApiKey = key ? encryptSecret(key) : undefined;
  }
  if (typeof body.claudeModel === "string") {
    user.claudeModel = body.claudeModel.trim() || undefined;
  }

  if (typeof body.geminiApiKey === "string") {
    const key = body.geminiApiKey.trim();
    user.geminiApiKey = key ? encryptSecret(key) : undefined;
  }
  if (typeof body.geminiModel === "string") {
    user.geminiModel = body.geminiModel.trim() || undefined;
  }

  if (typeof body.openaiApiKey === "string") {
    const key = body.openaiApiKey.trim();
    user.openaiApiKey = key ? encryptSecret(key) : undefined;
  }
  if (typeof body.openaiBaseUrl === "string") {
    const raw = body.openaiBaseUrl.trim();
    const check = validatePublicBaseUrl(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Ungültige OpenAI-Base-URL: ${check.reason}` },
        { status: 400 }
      );
    }
    user.openaiBaseUrl = raw || undefined;
  }
  if (typeof body.openaiModel === "string") {
    user.openaiModel = body.openaiModel.trim() || undefined;
  }

  if (typeof body.ollamaBaseUrl === "string") {
    const raw = body.ollamaBaseUrl.trim();
    // Ollama läuft per Definition lokal — der allgemeine Public-URL-Validator
    // würde localhost/private IPs blocken. Hier nutzen wir bewusst den
    // gelockerten Validator. Bei leerer Eingabe wird das Feld geleert
    // (Provider „verschwindet" damit aus der Liste).
    const check = validateOllamaBaseUrl(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Ungültige Ollama-Base-URL: ${check.reason}` },
        { status: 400 }
      );
    }
    user.ollamaBaseUrl = raw || undefined;
  }
  if (typeof body.ollamaModel === "string") {
    user.ollamaModel = body.ollamaModel.trim() || undefined;
  }

  if (typeof body.digestEnabled === "boolean") {
    user.digestEnabled = body.digestEnabled;
  }
  if (typeof body.alertsEnabled === "boolean") {
    user.alertsEnabled = body.alertsEnabled;
  }
  if (typeof body.notificationEmail === "string") {
    user.notificationEmail = body.notificationEmail.trim().toLowerCase() || undefined;
  }
  if (typeof body.aiDisabled === "boolean") {
    user.aiDisabled = body.aiDisabled;
  }
  if (typeof body.locale === "string" && (body.locale === "de" || body.locale === "en")) {
    user.locale = body.locale;
  }

  if (body.newPassword) {
    if (typeof body.newPassword !== "string") {
      return NextResponse.json({ error: t("auth.passwordRequired") }, { status: 400 });
    }
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Aktuelles Passwort erforderlich" },
        { status: 400 }
      );
    }
    const pwCheck = checkPasswordStrength(body.newPassword, {
      email: user.email,
      name: user.name,
    });
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }
    const ok = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: t("auth.passwordCurrentWrong") }, { status: 401 });
    }
    user.passwordHash = await hashPassword(body.newPassword);
  }

  await user.save();
  return NextResponse.json({ ok: true });
}
