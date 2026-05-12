import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuotesBatch } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * SPDR Select Sector ETFs — die 11 Sektoren des S&P 500 als investierbare
 * ETFs. Tagesveränderung bietet eine schnelle Übersicht, welche Bereiche
 * des US-Marktes heute Treiber bzw. Bremser sind.
 */
const SPDR_SECTORS: Array<{ ticker: string; name: string }> = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLC", name: "Communication Services" },
  { ticker: "XLY", name: "Consumer Discretionary" },
  { ticker: "XLP", name: "Consumer Staples" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLV", name: "Health Care" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLU", name: "Utilities" },
];

export interface SectorHeatmapRow {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface CacheEntry {
  at: number;
  rows: SectorHeatmapRow[];
}
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: CacheEntry | null = null;

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ rows: cached.rows, asOf: cached.at });
  }

  try {
    const quotes = await getQuotesBatch(SPDR_SECTORS.map((s) => s.ticker));
    const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

    const rows: SectorHeatmapRow[] = [];
    for (const s of SPDR_SECTORS) {
      const q = quoteMap.get(s.ticker.toUpperCase());
      if (!q) continue;
      rows.push({
        ticker: s.ticker,
        name: s.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        currency: q.currency || "USD",
      });
    }

    cached = { at: Date.now(), rows };
    return NextResponse.json({ rows, asOf: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 }
    );
  }
}
