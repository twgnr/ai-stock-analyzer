import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInsiderTrades } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const { ticker } = await params;
  const trades = await getInsiderTrades(decodeURIComponent(ticker));
  return NextResponse.json({ trades });
}
