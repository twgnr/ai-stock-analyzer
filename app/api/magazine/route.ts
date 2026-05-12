import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MagazineAnalysis } from "@/lib/models/MagazineAnalysis";
import { getAppSettings } from "@/lib/models/AppSettings";
import { getCurrentUser } from "@/lib/auth";
import { buildAIConfig, listUserProviders } from "@/lib/ai/factory";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const settings = await getAppSettings();
  const sharingEnabled = settings.magazineSharingEnabled !== false;
  // Document-Block kann nur Claude/Gemini, also OpenAI-compat und Ollama raus.
  const availableProviders = listUserProviders(user)
    .filter((p) => p.provider !== "openai-compat" && p.provider !== "ollama")
    .map(({ provider, model }) => ({ provider, model }));
  // "Standard"-Label soll den Provider zeigen, den buildAIConfig auch nimmt.
  const resolvedCfg = buildAIConfig(user);
  const defaultProvider = resolvedCfg?.provider || user.aiProvider || "claude";

  const mine = await MagazineAnalysis.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .lean();
  const shared = sharingEnabled
    ? await MagazineAnalysis.find({
        isPublic: true,
        userId: { $ne: user._id },
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    : [];

  const shape = (
    a: (typeof mine)[number],
    includeEmail: boolean
  ) => ({
    _id: String(a._id),
    magazineTitle: a.magazineTitle,
    customTitle: a.customTitle ?? null,
    issueNumber: a.issueNumber,
    issueDate: a.issueDate,
    summary: a.summary,
    coverTopics: a.coverTopics,
    recommendationCount: a.recommendations?.length || 0,
    isPublic: a.isPublic,
    isOwn: String(a.userId) === user.userId,
    uploaderName: a.uploaderName,
    uploaderEmail: includeEmail ? a.uploaderEmail : undefined,
    originalFilename: a.originalFilename,
    provider: a.provider || null,
    model: a.model,
    createdAt: a.createdAt,
  });

  return NextResponse.json({
    mine: mine.map((a) => shape(a, true)),
    shared: shared.map((a) => shape(a, false)),
    config: {
      sharingEnabled,
      availableProviders,
      defaultProvider,
    },
  });
}
