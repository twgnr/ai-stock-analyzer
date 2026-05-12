import { NextRequest, NextResponse } from "next/server";
import {
  getStocktwitsStream,
  StocktwitsFetchError,
} from "@/lib/stocktwits";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ ticker: string }> };

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const { ticker } = await params;
  if (!ticker) {
    return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  }

  try {
    const stream = await getStocktwitsStream(ticker, 20);
    return NextResponse.json(stream);
  } catch (e) {
    if (e instanceof StocktwitsFetchError) {
      console.warn("[stocktwits-api]", e.message);
      const reason =
        e.status === 429
          ? "Stocktwits ratenlimitiert. Bitte später erneut."
          : `Stocktwits nicht erreichbar (${e.status ?? "Netzwerkfehler"}).`;
      return NextResponse.json(
        {
          ticker,
          found: false,
          messages: [],
          bullishCount: 0,
          bearishCount: 0,
          neutralCount: 0,
          bullishRatio: null,
          reason,
          status: e.status ?? 0,
        },
        { status: 200 }
      );
    }
    console.error("[stocktwits-api]", e);
    return NextResponse.json(
      {
        ticker,
        found: false,
        messages: [],
        bullishCount: 0,
        bearishCount: 0,
        neutralCount: 0,
        bullishRatio: null,
        reason: e instanceof Error ? e.message : "Unbekannter Fehler",
        status: 500,
      },
      { status: 200 }
    );
  }
}
