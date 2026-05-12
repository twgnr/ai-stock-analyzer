import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Watchlist } from "@/lib/models/Watchlist";
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

  // Feld-Whitelist — Body 1:1 durchzureichen wäre ein Mass-Assignment-Risiko,
  // da Schema-Erweiterungen (z.B. Admin-Flags) ungewollt beschreibbar würden.
  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string") {
    update.name = body.name.trim().slice(0, 200) || undefined;
  }
  if (typeof body?.notes === "string") {
    update.notes = body.notes.trim().slice(0, 500) || undefined;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: t("validation.noAllowedFields") }, { status: 400 });
  }

  const updated = await Watchlist.findOneAndUpdate(
    { _id: id, userId: user._id },
    { $set: update },
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
  const deleted = await Watchlist.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!deleted) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
