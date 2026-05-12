import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { StockNote } from "@/lib/models/StockNote";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY = 5000;

export async function PATCH(req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body?.body === "string") {
    const text = body.body.trim();
    if (!text) {
      return NextResponse.json({ error: t("validation.noteEmpty") }, { status: 400 });
    }
    if (text.length > MAX_BODY) {
      return NextResponse.json(
        { error: `Notiz zu lang (max. ${MAX_BODY} Zeichen)` },
        { status: 400 }
      );
    }
    update.body = text;
  }
  if (typeof body?.pinned === "boolean") {
    update.pinned = body.pinned;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: t("validation.noAllowedFields") }, { status: 400 });
  }

  const updated = await StockNote.findOneAndUpdate(
    { _id: id, userId: user._id },
    { $set: update },
    { new: true }
  ).lean();
  if (!updated) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({
    _id: String(updated._id),
    ticker: updated.ticker,
    body: updated.body,
    pinned: !!updated.pinned,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const deleted = await StockNote.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!deleted) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
