import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RelationshipMap } from "@/lib/models/RelationshipMap";
import { getQuote } from "@/lib/yahoo";
import { analyzeRelationships, hasClaudeKey, getModelName } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { ticker, force, cacheOnly } = await req.json();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  const symbol = String(ticker).toUpperCase();

  try {
    await connectDB();

    // Cached-Daten bleiben dauerhaft verfügbar — kein automatischer Verfall
    // nach N Tagen. User stößt ein Refresh explizit per `force=true` an.
    if (!force) {
      const existing = await RelationshipMap.findOne({ ticker: symbol }).lean();
      if (existing) {
        return NextResponse.json({
          ticker: existing.ticker,
          name: existing.name,
          summary: existing.summary,
          relationships: existing.relationships,
          model: existing.model,
          cached: true,
          updatedAt: existing.updatedAt,
        });
      }
      if (cacheOnly) {
        return NextResponse.json({ notCached: true });
      }
    }

    if (!(await hasClaudeKey(user))) {
      return NextResponse.json(
        { error: t("ai.noKey") },
        { status: 503 }
      );
    }

    const quote = await getQuote(symbol);
    const result = await analyzeRelationships(symbol, quote.name, user);

    const saved = await RelationshipMap.findOneAndUpdate(
      { ticker: symbol },
      {
        $set: {
          ticker: symbol,
          name: quote.name,
          summary: result.summary,
          relationships: result.relationships,
          model: getModelName(user),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({
      ticker: saved!.ticker,
      name: saved!.name,
      summary: saved!.summary,
      relationships: saved!.relationships,
      model: saved!.model,
      cached: false,
      updatedAt: saved!.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Beziehungs-Analyse fehlgeschlagen";
    console.error("[relationships]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
