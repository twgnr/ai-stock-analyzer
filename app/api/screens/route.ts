import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SavedScreen } from "@/lib/models/SavedScreen";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const screens = await SavedScreen.find({ userId: user._id })
    .sort({ updatedAt: -1 })
    .lean();
  return NextResponse.json(screens.map((s) => ({ ...s, _id: String(s._id) })));
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { name, filters } = await req.json();
  if (!name || !filters) {
    return NextResponse.json({ error: t("validation.nameAndFiltersRequired") }, { status: 400 });
  }
  const existing = await SavedScreen.findOne({ userId: user._id, name });
  if (existing) {
    existing.filters = filters;
    await existing.save();
    return NextResponse.json({ ...existing.toObject(), _id: String(existing._id) });
  }
  const created = await SavedScreen.create({ userId: user._id, name, filters });
  return NextResponse.json(
    { ...created.toObject(), _id: String(created._id) },
    { status: 201 }
  );
}
