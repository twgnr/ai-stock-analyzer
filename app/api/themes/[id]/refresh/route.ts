import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ThemeBasket } from "@/lib/models/ThemeBasket";
import { getCurrentUser } from "@/lib/auth";
import { generateThemeBasket } from "@/lib/themeBasketGenerator";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  try {
    const { id } = await params;
    const basket = await ThemeBasket.findById(id);
    if (!basket) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

    const isGlobal = basket.userId === null;
    const isOwn = !isGlobal && String(basket.userId) === String(user._id);
    const canEdit = isOwn || (isGlobal && user.role === "admin");
    if (!canEdit) {
      return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
    }

    const result = await generateThemeBasket(basket.name, basket.description, user);

    basket.bigPlayers = result.bigPlayers;
    basket.midPlayers = result.midPlayers;
    basket.smallPlayers = result.smallPlayers;
    basket.generatedAt = new Date();
    basket.generationModel = result.generationModel;
    basket.generationCostUsd = result.generationCostUsd;
    await basket.save();

    return NextResponse.json({
      _id: String(basket._id),
      generatedAt: basket.generatedAt,
      generationModel: basket.generationModel,
      counts: {
        big: basket.bigPlayers.length,
        mid: basket.midPlayers.length,
        small: basket.smallPlayers.length,
      },
      diagnostics: result.diagnostics,
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Refresh fehlgeschlagen");
  }
}
