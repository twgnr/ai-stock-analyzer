import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { getQuote, getFundamentals, getNews } from "@/lib/yahoo";
import { checkThesis, hasClaudeKey } from "@/lib/claude";
import { getApiTranslations } from "@/lib/i18n-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id))
    return NextResponse.json({ error: t("validation.invalidId") }, { status: 400 });

  await connectDB();
  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  if (typeof body.thesis === "string") allowed.thesis = body.thesis;
  if (typeof body.exitCriteria === "string") allowed.exitCriteria = body.exitCriteria;
  if (typeof body.expectedHorizonMonths === "number")
    allowed.expectedHorizonMonths = body.expectedHorizonMonths;
  if (body.status === "CLOSED") {
    allowed.status = "CLOSED";
    allowed.closedAt = new Date();
    if (typeof body.closedReason === "string") allowed.closedReason = body.closedReason;
  }

  const updated = await InvestmentThesis.findOneAndUpdate(
    { _id: id, userId: user._id },
    { $set: allowed },
    { new: true }
  ).lean();
  if (!updated) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  return NextResponse.json({
    ...updated,
    _id: String(updated._id),
    userId: String(updated.userId),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const { id } = await params;
  await connectDB();
  await InvestmentThesis.deleteOne({ _id: id, userId: user._id });
  return NextResponse.json({ ok: true });
}

/** POST /api/thesis/:id — führt einen KI-Check gegen aktuelle Fakten durch */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKeyShort") },
      { status: 503 }
    );
  }

  const { id } = await params;
  await connectDB();
  const thesis = await InvestmentThesis.findOne({ _id: id, userId: user._id });
  if (!thesis) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  const quote = await getQuote(thesis.ticker);
  const [fundamentals, news] = await Promise.all([
    getFundamentals(thesis.ticker),
    getNews(thesis.ticker, 10),
  ]);

  const check = await checkThesis(
    {
      ticker: thesis.ticker,
      name: quote.name,
      originalThesis: thesis.thesis,
      writtenAt: thesis.createdAt.toISOString(),
      currentPrice: quote.price,
      avgPrice: thesis.priceAtEntry,
      currency: thesis.currency || quote.currency,
      fundamentals: fundamentals as Record<string, unknown> | null,
      news: news.map((n) => ({
        title: n.title,
        publisher: n.publisher,
        publishedAt: n.publishedAt,
      })),
    },
    user
  );

  thesis.lastCheckStatus = check.status;
  thesis.lastCheckVerdict = check.verdict;
  thesis.lastCheckReasoning = check.reasoning;
  thesis.lastCheckSupporting = check.supportingEvidence;
  thesis.lastCheckContradicting = check.contradictingEvidence;
  thesis.lastCheckRecommendation = check.recommendedAction;
  thesis.lastCheckAt = new Date();
  thesis.status =
    check.status === "BROKEN" ? "BROKEN" : check.status === "AT_RISK" ? "AT_RISK" : "ON_TRACK";
  await thesis.save();

  return NextResponse.json({
    ...thesis.toObject(),
    _id: String(thesis._id),
    userId: String(thesis.userId),
    check,
  });
}

export const runtime = "nodejs";
