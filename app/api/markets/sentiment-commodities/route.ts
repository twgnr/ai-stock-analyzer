import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuotesBatch } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface SymbolDef {
  ticker: string;
  name: string;
  hint: string;
  category: "sentiment" | "commodity";
}

const SYMBOLS: SymbolDef[] = [
  // Sentiment / Risk-Indikatoren
  {
    ticker: "^VIX",
    name: "VIX",
    hint: "Implizite 30-Tage-Volatilität S&P 500. >25 = nervöser Markt.",
    category: "sentiment",
  },
  {
    ticker: "^TNX",
    name: "10Y Treasury",
    hint: "10-jährige US-Staatsanleihen-Rendite (in 1/10 %).",
    category: "sentiment",
  },
  {
    ticker: "DX-Y.NYB",
    name: "USD-Index",
    hint: "Dollar-Stärke gegen 6 Hauptwährungen (DXY).",
    category: "sentiment",
  },
  {
    ticker: "EURUSD=X",
    name: "EUR/USD",
    hint: "Euro pro US-Dollar.",
    category: "sentiment",
  },
  // Rohstoffe
  {
    ticker: "GC=F",
    name: "Gold",
    hint: "Gold-Future Spot-Preis (USD/Unze).",
    category: "commodity",
  },
  {
    ticker: "SI=F",
    name: "Silver",
    hint: "Silber-Future Spot-Preis (USD/Unze).",
    category: "commodity",
  },
  {
    ticker: "CL=F",
    name: "WTI Oil",
    hint: "WTI-Rohöl-Future (USD/Barrel).",
    category: "commodity",
  },
  {
    ticker: "BZ=F",
    name: "Brent Oil",
    hint: "Brent-Rohöl-Future (USD/Barrel).",
    category: "commodity",
  },
  {
    ticker: "NG=F",
    name: "Natural Gas",
    hint: "Henry-Hub Erdgas-Future.",
    category: "commodity",
  },
  {
    ticker: "BTC-USD",
    name: "Bitcoin",
    hint: "BTC/USD Spot.",
    category: "commodity",
  },
  {
    ticker: "ETH-USD",
    name: "Ethereum",
    hint: "ETH/USD Spot.",
    category: "commodity",
  },
];

export interface MarketSnapshotRow {
  ticker: string;
  name: string;
  hint: string;
  category: "sentiment" | "commodity";
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface CacheEntry {
  at: number;
  rows: MarketSnapshotRow[];
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
    const quotes = await getQuotesBatch(SYMBOLS.map((s) => s.ticker));
    const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

    const rows: MarketSnapshotRow[] = [];
    for (const s of SYMBOLS) {
      const q = quoteMap.get(s.ticker.toUpperCase());
      if (!q) continue;
      rows.push({
        ticker: s.ticker,
        name: s.name,
        hint: s.hint,
        category: s.category,
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
