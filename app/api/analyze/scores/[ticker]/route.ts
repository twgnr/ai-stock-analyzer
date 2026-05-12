import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getFinancialsHistory,
  getQuote,
  getShortInterest,
  getEpsRevisions,
  getDividendInfo,
  yahooFinance,
} from "@/lib/yahoo";
import {
  computePiotroski,
  computeAltman,
  computeBeneish,
  computeGrahamNumber,
  computeShareholderYield,
} from "@/lib/fundamentalScores";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();

  const [financials, quote, summary, shortInterest, epsRevisions, dividend] =
    await Promise.all([
      getFinancialsHistory(ticker),
      getQuote(ticker).catch(() => null),
      yahooFinance
        .quoteSummary(ticker, {
          modules: ["defaultKeyStatistics", "summaryDetail", "price"],
        })
        .catch(() => null),
      getShortInterest(ticker),
      getEpsRevisions(ticker),
      getDividendInfo(ticker).catch(() => null),
    ]);

  const annual = financials?.annual || [];
  const piotroski = computePiotroski(annual);
  const altman = computeAltman(annual, summary?.price?.marketCap);
  const beneish = computeBeneish(annual);

  const eps = summary?.defaultKeyStatistics?.trailingEps ?? null;
  const bookValuePerShare = summary?.defaultKeyStatistics?.bookValue ?? null;
  const graham = computeGrahamNumber(eps, bookValuePerShare, quote?.price ?? null);

  const shareholder = computeShareholderYield(
    annual,
    summary?.price?.marketCap ?? null,
    summary?.summaryDetail?.dividendYield ?? null
  );

  return NextResponse.json({
    ticker,
    currency:
      summary?.price?.currency || quote?.currency || financials?.currency || "USD",
    financialCurrency: financials?.currency || null,
    marketCap: summary?.price?.marketCap ?? null,
    piotroski,
    altman,
    beneish,
    graham,
    shareholderYield: shareholder,
    shortInterest,
    epsRevisions,
    dividendGrowth: dividend
      ? {
          cagr3y: dividend.growthCagr3y,
          cagr5y: dividend.growthCagr5y,
          cagr10y: dividend.growthCagr10y,
          streakYears: dividend.dividendGrowthStreakYears,
          annualHistory: dividend.annualHistory,
          currency: dividend.currency,
        }
      : null,
  });
}
