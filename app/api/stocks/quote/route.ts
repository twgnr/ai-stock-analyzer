import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const tickers = req.nextUrl.searchParams.get("tickers");
  if (!tickers) return NextResponse.json({ error: tr("validation.tickersQueryMissing") }, { status: 400 });
  const list = tickers.split(",").map((t) => t.trim()).filter(Boolean);
  try {
    const quotes = await getQuotes(list);
    return NextResponse.json(quotes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fehler beim Kursabruf";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
