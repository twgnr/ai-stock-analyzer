import { NextRequest, NextResponse } from "next/server";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const currenciesParam = req.nextUrl.searchParams.get("currencies");
  const base = req.nextUrl.searchParams.get("base") || BASE_CURRENCY;
  if (!currenciesParam) {
    return NextResponse.json({ error: t("validation.currenciesMissing") }, { status: 400 });
  }
  const list = currenciesParam.split(",").map((c) => c.trim()).filter(Boolean);
  try {
    const rates = await getRates(list, base);
    return NextResponse.json({ base, rates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FX-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
