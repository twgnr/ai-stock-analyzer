import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { ThemeBasket } from "@/lib/models/ThemeBasket";
import { getCurrentUser } from "@/lib/auth";
import { generateThemeBasket } from "@/lib/themeBasketGenerator";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

export const runtime = "nodejs";
// KI-Generierung kann je nach Provider 30–60 s dauern.
export const maxDuration = 120;

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  // User sieht: eigene Baskets + globale Default-Baskets (userId == null).
  const items = await ThemeBasket.find({
    $or: [{ userId: user._id }, { userId: null }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json(
    items.map((b) => ({
      _id: String(b._id),
      name: b.name,
      description: b.description,
      isGlobal: b.userId === null,
      isOwn: b.userId !== null && String(b.userId) === String(user._id),
      counts: {
        big: b.bigPlayers?.length ?? 0,
        mid: b.midPlayers?.length ?? 0,
        small: b.smallPlayers?.length ?? 0,
      },
      generatedAt: b.generatedAt,
      updatedAt: b.updatedAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    if (!name) {
      return NextResponse.json({ error: t("validation.nameMissing") }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json(
        { error: "Name zu lang (max. 120 Zeichen)" },
        { status: 400 }
      );
    }
    if (description.length > 600) {
      return NextResponse.json(
        { error: "Beschreibung zu lang (max. 600 Zeichen)" },
        { status: 400 }
      );
    }

    // Nur Admins dürfen Default-Baskets (userId = null) anlegen.
    const wantsGlobal = body?.scope === "global";
    if (wantsGlobal && user.role !== "admin") {
      return NextResponse.json(
        { error: "Nur Admins dürfen globale Themen anlegen." },
        { status: 403 }
      );
    }
    const ownerId: Types.ObjectId | null = wantsGlobal ? null : user._id;

    // Doppelten Namen im selben Scope sofort erkennen — das Unique-Index hätte
    // sonst einen 11000-Mongo-Fehler geworfen, mit user-feindlicher Meldung.
    const existing = await ThemeBasket.findOne({ userId: ownerId, name }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "Ein Thema mit diesem Namen existiert bereits in deinem Bereich." },
        { status: 409 }
      );
    }

    const result = await generateThemeBasket(name, description, user);

    const created = await ThemeBasket.create({
      userId: ownerId,
      name,
      description,
      bigPlayers: result.bigPlayers,
      midPlayers: result.midPlayers,
      smallPlayers: result.smallPlayers,
      generatedAt: new Date(),
      generationModel: result.generationModel,
      generationCostUsd: result.generationCostUsd,
    });

    return NextResponse.json(
      {
        _id: String(created._id),
        name: created.name,
        description: created.description,
        isGlobal: ownerId === null,
        isOwn: ownerId !== null,
        counts: {
          big: created.bigPlayers.length,
          mid: created.midPlayers.length,
          small: created.smallPlayers.length,
        },
        diagnostics: result.diagnostics,
      },
      { status: 201 }
    );
  } catch (e) {
    return apiErrorResponse(e, 500, "Themen-Erzeugung fehlgeschlagen");
  }
}
