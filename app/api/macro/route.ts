import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

// Alle Daten kommen aus Yahoo Finance — das spart die FRED-Integration und
// deren API-Key-Verwaltung. Die Treasury-Yields bei Yahoo sind Quotes mit
// regularMarketPrice = aktueller Rendite in Prozent.

const YIELD_CURVE: Array<{ symbol: string; label: string; maturityYears: number }> = [
  { symbol: "^IRX", label: "3M", maturityYears: 0.25 },
  { symbol: "^FVX", label: "5Y", maturityYears: 5 },
  { symbol: "^TNX", label: "10Y", maturityYears: 10 },
  { symbol: "^TYX", label: "30Y", maturityYears: 30 },
];

const SECTORS: Array<{ symbol: string; label: string }> = [
  { symbol: "XLK", label: "Tech" },
  { symbol: "XLF", label: "Finanzen" },
  { symbol: "XLV", label: "Gesundheit" },
  { symbol: "XLE", label: "Energie" },
  { symbol: "XLY", label: "Konsum Zyklisch" },
  { symbol: "XLP", label: "Konsum Defensiv" },
  { symbol: "XLI", label: "Industrie" },
  { symbol: "XLU", label: "Versorger" },
  { symbol: "XLB", label: "Grundstoffe" },
  { symbol: "XLRE", label: "Immobilien" },
  { symbol: "XLC", label: "Kommunikation" },
];

const SENTIMENT = [
  { symbol: "^VIX", label: "VIX (S&P 500-Vola)" },
  { symbol: "^VXN", label: "VXN (Nasdaq-Vola)" },
  { symbol: "DX-Y.NYB", label: "Dollar-Index (DXY)" },
  { symbol: "GC=F", label: "Gold (Future)" },
  { symbol: "CL=F", label: "Rohöl WTI" },
  { symbol: "BTC-USD", label: "Bitcoin" },
];

function interpretVix(price: number): string {
  if (price < 15) return "Ruhiger Markt — tiefe implizite Volatilität";
  if (price < 20) return "Normal";
  if (price < 30) return "Erhöhte Nervosität";
  return "Panik-Niveau — starke Absicherungsbewegung";
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const allSymbols = [
    ...YIELD_CURVE.map((y) => y.symbol),
    ...SECTORS.map((s) => s.symbol),
    ...SENTIMENT.map((s) => s.symbol),
  ];
  const quotes = await getQuotes(allSymbols);
  const qMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  const yields = YIELD_CURVE.map((y) => {
    const q = qMap.get(y.symbol);
    return {
      label: y.label,
      symbol: y.symbol,
      maturityYears: y.maturityYears,
      yield: q?.price ?? null,
      change: q?.changePercent ?? null,
    };
  });
  const y10 = yields.find((y) => y.label === "10Y")?.yield ?? null;
  const y2 = null; // Yahoo liefert kein direktes 2Y-Symbol, nutze 5Y-Spread als Proxy
  const y5 = yields.find((y) => y.label === "5Y")?.yield ?? null;
  const y3m = yields.find((y) => y.label === "3M")?.yield ?? null;
  const spread10y3m = y10 != null && y3m != null ? y10 - y3m : null;
  const spread10y5y = y10 != null && y5 != null ? y10 - y5 : null;
  const curveInverted = spread10y3m != null && spread10y3m < 0;

  const sectors = SECTORS.map((s) => {
    const q = qMap.get(s.symbol);
    return {
      symbol: s.symbol,
      label: s.label,
      price: q?.price ?? null,
      changePercent: q?.changePercent ?? null,
    };
  });

  const sentiment = SENTIMENT.map((s) => {
    const q = qMap.get(s.symbol);
    return {
      symbol: s.symbol,
      label: s.label,
      price: q?.price ?? null,
      changePercent: q?.changePercent ?? null,
      currency: q?.currency,
      interpretation:
        s.symbol === "^VIX" && q?.price != null ? interpretVix(q.price) : undefined,
    };
  });

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    yieldCurve: {
      points: yields,
      spread10y3m,
      spread10y5y,
      y2Proxy: y2,
      curveInverted,
    },
    sectors,
    sentiment,
  });
}

export const runtime = "nodejs";
