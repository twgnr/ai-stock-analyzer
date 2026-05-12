import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.shares != null) {
    const s = Number(body.shares);
    if (!(s > 0)) return NextResponse.json({ error: t("validation.sharesPositive") }, { status: 400 });
    update.shares = s;
  }
  if (body.avgPrice != null) {
    const p = Number(body.avgPrice);
    if (!(p > 0)) return NextResponse.json({ error: t("validation.avgPricePositive") }, { status: 400 });
    update.avgPrice = p;
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    update.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.notes === "string") {
    update.notes = body.notes.trim() || undefined;
  }
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }

  const updated = await Position.findOneAndUpdate(
    { _id: id, userId: user._id },
    update,
    { new: true }
  ).lean();
  if (!updated) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ...updated, _id: String(updated._id) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const deleted = await Position.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!deleted) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
