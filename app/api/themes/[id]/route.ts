import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ThemeBasket } from "@/lib/models/ThemeBasket";
import { getCurrentUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const basket = await ThemeBasket.findById(id).lean();
  if (!basket) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  // Sichtbarkeit: eigener Basket oder globaler Default.
  const isGlobal = basket.userId === null;
  const isOwn = !isGlobal && String(basket.userId) === String(user._id);
  if (!isGlobal && !isOwn) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }

  return NextResponse.json({
    _id: String(basket._id),
    name: basket.name,
    description: basket.description,
    isGlobal,
    isOwn,
    canEdit: isOwn || (isGlobal && user.role === "admin"),
    bigPlayers: basket.bigPlayers,
    midPlayers: basket.midPlayers,
    smallPlayers: basket.smallPlayers,
    generatedAt: basket.generatedAt,
    generationModel: basket.generationModel,
    updatedAt: basket.updatedAt,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const basket = await ThemeBasket.findById(id).lean();
  if (!basket) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  const isGlobal = basket.userId === null;
  const isOwn = !isGlobal && String(basket.userId) === String(user._id);
  const canDelete = isOwn || (isGlobal && user.role === "admin");
  if (!canDelete) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }

  try {
    await ThemeBasket.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e, 500, "Löschen fehlgeschlagen");
  }
}
