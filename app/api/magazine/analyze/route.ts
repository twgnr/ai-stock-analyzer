import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MagazineAnalysis } from "@/lib/models/MagazineAnalysis";
import { getAppSettings } from "@/lib/models/AppSettings";
import { getCurrentUser } from "@/lib/auth";
import { analyzeMagazine, hasClaudeKey } from "@/lib/claude";
import { apiErrorResponse, UserFacingError } from "@/lib/apiError";
import { buildAIConfigForProvider } from "@/lib/ai/factory";
import type { AIConfig, AIProvider } from "@/lib/ai/types";
import { getApiTranslations } from "@/lib/i18n-server";

// 32 MB = Anthropic-Document-API-Limit. Muss < proxyClientMaxBodySize in
// next.config.ts (35 MB) bleiben, sonst gibt der Proxy einen abgeschnittenen
// Body zurück statt unserer sauberen 400.
const MAX_PDF_BYTES = 32 * 1024 * 1024;

const VALID_PROVIDERS: AIProvider[] = ["claude", "gemini", "openai-compat", "ollama"];

function isContextTooLongError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /prompt is too long|context_length_exceeded|maximum context length|exceeds.*context|exceeds.*token limit|too many tokens|input token limit/i.test(
    e.message
  );
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data erforderlich" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("pdf") as File | null;
  const userHint = (form.get("hint") as string) || "";
  const makePublic = form.get("isPublic") === "true";
  const customTitleRaw = ((form.get("customTitle") as string) || "").trim();
  const customTitle = customTitleRaw.slice(0, 200) || null;
  const providerOverrideRaw = (form.get("provider") as string) || "";

  if (!file) {
    return NextResponse.json({ error: t("validation.pdfMissing") }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `PDF zu groß (max ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)} MB)` },
      { status: 400 }
    );
  }
  const mime = file.type || "application/pdf";
  if (!mime.includes("pdf")) {
    return NextResponse.json(
      { error: "Nur PDF-Dateien werden unterstützt" },
      { status: 400 }
    );
  }

  // Optionaler Per-Call-Override aus dem Magazin-UI.
  let overrideConfig: AIConfig | undefined = undefined;
  let effectiveProvider: AIProvider = user.aiProvider || "claude";
  if (providerOverrideRaw) {
    if (!VALID_PROVIDERS.includes(providerOverrideRaw as AIProvider)) {
      return NextResponse.json(
        { error: `Unbekannter Provider: ${providerOverrideRaw}` },
        { status: 400 }
      );
    }
    const requested = providerOverrideRaw as AIProvider;
    const cfg = buildAIConfigForProvider(user, requested);
    if (!cfg) {
      return NextResponse.json(
        {
          error: `Kein eigener API-Key für ${requested} hinterlegt. Bitte in den Einstellungen ergänzen oder einen anderen Provider wählen.`,
        },
        { status: 400 }
      );
    }
    overrideConfig = cfg;
    effectiveProvider = requested;
  }

  if (effectiveProvider === "openai-compat" || effectiveProvider === "ollama") {
    return NextResponse.json(
      {
        error:
          "PDF-Analyse wird vom gewählten Provider nicht unterstützt. Bitte Claude oder Gemini wählen.",
      },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const { result, usedConfig } = await analyzeMagazine(
      {
        document: {
          base64,
          mimeType: "application/pdf",
          filename: file.name,
        },
        userHint: userHint.trim() || undefined,
      },
      user,
      overrideConfig
    );

    await connectDB();
    const settings = await getAppSettings();
    const sharingAllowed = settings.magazineSharingEnabled !== false;
    const finalIsPublic = sharingAllowed && !!makePublic;
    const doc = await MagazineAnalysis.create({
      userId: user._id,
      uploaderEmail: user.email,
      uploaderName: user.name,
      originalFilename: file.name,
      magazineTitle: result.magazineTitle || "Unbekannt",
      customTitle,
      issueNumber: result.issueNumber || null,
      issueDate: result.issueDate || null,
      summary: result.summary || "",
      coverTopics: Array.isArray(result.coverTopics) ? result.coverTopics : [],
      marketOutlook: result.marketOutlook || null,
      recommendations: Array.isArray(result.recommendations)
        ? result.recommendations.map((r) => ({
            ticker: r.ticker || null,
            name: r.name,
            recommendation: r.recommendation,
            priceTarget: r.priceTarget || null,
            stopLoss: r.stopLoss || null,
            horizon: r.horizon || null,
            rationale: r.rationale,
            pageReference: r.pageReference || null,
            risks: Array.isArray(r.risks) ? r.risks : [],
          }))
        : [],
      isPublic: finalIsPublic,
      provider: usedConfig.provider,
      model: `${usedConfig.provider}:${usedConfig.model}`,
    });

    return NextResponse.json({ _id: String(doc._id) });
  } catch (e) {
    if (isContextTooLongError(e)) {
      return apiErrorResponse(
        new UserFacingError(
          "Die PDF ist zu umfangreich für das gewählte Modell (Kontextfenster überschritten). Bitte oben auf Gemini umschalten (1M Tokens) oder eine kleinere Ausgabe nutzen.",
          413
        )
      );
    }
    return apiErrorResponse(e, 500, "PDF-Analyse fehlgeschlagen.");
  }
}

export const runtime = "nodejs";
export const maxDuration = 120;
