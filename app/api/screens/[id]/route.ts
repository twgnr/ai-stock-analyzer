import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SavedScreen } from "@/lib/models/SavedScreen";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const deleted = await SavedScreen.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!deleted) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
