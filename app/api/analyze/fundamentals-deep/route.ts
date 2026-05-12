import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getEarningsData,
  getUpgradeDowngradeHistory,
  getOwnershipInfo,
  getFinancialsHistory,
} from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const [earnings, ratings, ownership, financials] = await Promise.all([
    getEarningsData(ticker),
    getUpgradeDowngradeHistory(ticker),
    getOwnershipInfo(ticker),
    getFinancialsHistory(ticker),
  ]);

  return NextResponse.json({
    ticker,
    earnings,
    ratings,
    ownership,
    financials,
  });
}

export const runtime = "nodejs";
