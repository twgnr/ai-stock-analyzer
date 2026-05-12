import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFinancialsHistory, getQuote, yahooFinance } from "@/lib/yahoo";
import { runDcf, runReverseDcf } from "@/lib/dcf";
import { getApiTranslations } from "@/lib/i18n-server";

interface Body {
  ticker: string;
  initialFcf?: number;
  initialGrowthPct?: number;
  terminalGrowthPct?: number;
  waccPct?: number;
  years?: number;
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const ticker = String(body.ticker || "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const [financials, quote, summary] = await Promise.all([
    getFinancialsHistory(ticker),
    getQuote(ticker).catch(() => null),
    yahooFinance
      .quoteSummary(ticker, {
        modules: ["defaultKeyStatistics", "financialData", "price"],
      })
      .catch(() => null),
  ]);

  const annual = financials?.annual || [];
  const latest = annual[0];
  const fcfGuess =
    latest?.operatingCashflow != null && latest?.capitalExpenditures != null
      ? latest.operatingCashflow + latest.capitalExpenditures // CapEx kommt bei Yahoo negativ
      : summary?.financialData?.freeCashflow ?? null;

  const shares =
    summary?.defaultKeyStatistics?.sharesOutstanding ??
    summary?.defaultKeyStatistics?.impliedSharesOutstanding ??
    null;

  const totalDebt = summary?.financialData?.totalDebt ?? null;
  const cash = summary?.financialData?.totalCash ?? null;
  const netDebt =
    totalDebt != null && cash != null
      ? totalDebt - cash
      : latest?.longTermDebt != null && latest?.cashAndEquivalents != null
        ? latest.longTermDebt - latest.cashAndEquivalents
        : 0;

  const initialFcf =
    typeof body.initialFcf === "number" ? body.initialFcf : fcfGuess;
  if (initialFcf == null || initialFcf <= 0) {
    return NextResponse.json(
      {
        error:
          "Keine brauchbare FCF-Basis gefunden. Bitte initialFcf manuell übergeben.",
        defaults: {
          initialFcf: fcfGuess,
          sharesOutstanding: shares,
          netDebt,
          currentPrice: quote?.price ?? null,
        },
      },
      { status: 400 }
    );
  }
  if (shares == null || shares <= 0) {
    return NextResponse.json(
      { error: "Shares-Outstanding unbekannt — DCF nicht berechenbar" },
      { status: 400 }
    );
  }

  const years = body.years ?? 10;
  const initialGrowthPct = body.initialGrowthPct ?? 6;
  const terminalGrowthPct = body.terminalGrowthPct ?? 2.5;
  const waccPct = body.waccPct ?? 9;

  const base = runDcf({
    initialFcf,
    sharesOutstanding: shares,
    netDebt,
    years,
    initialGrowthPct,
    terminalGrowthPct,
    waccPct,
  });

  const bear = runDcf({
    initialFcf,
    sharesOutstanding: shares,
    netDebt,
    years,
    initialGrowthPct: Math.max(-10, initialGrowthPct - 4),
    terminalGrowthPct,
    waccPct,
  });
  const bull = runDcf({
    initialFcf,
    sharesOutstanding: shares,
    netDebt,
    years,
    initialGrowthPct: initialGrowthPct + 4,
    terminalGrowthPct,
    waccPct,
  });

  let reverse = null;
  if (quote?.price) {
    reverse = runReverseDcf({
      currentPrice: quote.price,
      sharesOutstanding: shares,
      netDebt,
      initialFcf,
      years,
      terminalGrowthPct,
      waccPct,
    });
  }

  return NextResponse.json({
    ticker,
    currency:
      summary?.price?.currency || quote?.currency || financials?.currency || "USD",
    currentPrice: quote?.price ?? null,
    defaults: {
      initialFcf,
      sharesOutstanding: shares,
      netDebt,
    },
    scenarios: {
      bear,
      base,
      bull,
    },
    reverse,
  });
}

export const runtime = "nodejs";
