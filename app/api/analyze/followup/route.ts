import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { analyzeFollowUp, hasClaudeKey } from "@/lib/claude";
import { rateLimitResponse } from "@/lib/rateLimit";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_TOPIC_LEN = 600;
const MAX_ORIGINAL_LEN = 6000;

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const limited = rateLimitResponse(`followup:${user.userId}`, 60, 60 * 60);
  if (limited) return limited;

  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const body = await req.json();
  const topic = String(body?.topic || "").trim();
  const originalSummary = String(body?.originalSummary || "").trim();
  const ticker = body?.ticker ? String(body.ticker).toUpperCase() : undefined;

  if (!topic) return NextResponse.json({ error: t("validation.topicMissing") }, { status: 400 });
  if (!originalSummary)
    return NextResponse.json({ error: t("validation.originalSummaryMissing") }, { status: 400 });
  if (topic.length > MAX_TOPIC_LEN)
    return NextResponse.json(
      { error: `Topic zu lang (max. ${MAX_TOPIC_LEN} Zeichen).` },
      { status: 413 }
    );
  if (originalSummary.length > MAX_ORIGINAL_LEN)
    return NextResponse.json(
      { error: `Original-Analyse zu lang (max. ${MAX_ORIGINAL_LEN} Zeichen).` },
      { status: 413 }
    );

  try {
    const result = await analyzeFollowUp(
      { topic, originalSummary, ticker },
      user
    );
    return NextResponse.json(result);
  } catch (e) {
    return apiErrorResponse(e, 500, "Vertiefung fehlgeschlagen.");
  }
}
