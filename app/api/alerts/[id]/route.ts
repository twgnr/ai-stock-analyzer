import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PriceAlert } from "@/lib/models/PriceAlert";
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
  if (typeof body.active === "boolean") update.active = body.active;
  if (body.active === true) update.triggeredAt = null;
  if (typeof body.threshold === "number") update.threshold = body.threshold;
  const updated = await PriceAlert.findOneAndUpdate(
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
  const deleted = await PriceAlert.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!deleted) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
