import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface TickerSymbol {
  label: string;
  symbol: string;
  /** Einheit für die Preis-Anzeige — wenn leer, wird die Yahoo-Währung verwendet. */
  suffix?: string;
  /** Nachkommastellen für die Preis-Anzeige */
  digits?: number;
}

const SYMBOLS: TickerSymbol[] = [
  { label: "DAX", symbol: "^GDAXI", digits: 0 },
  { label: "Dow Jones", symbol: "^DJI", digits: 0 },
  { label: "S&P 500", symbol: "^GSPC", digits: 2 },
  { label: "Nikkei 225", symbol: "^N225", digits: 0 },
  { label: "Gold", symbol: "GC=F", suffix: "USD/oz", digits: 2 },
  { label: "EUR/USD", symbol: "EURUSD=X", digits: 4 },
  { label: "BTC/USD", symbol: "BTC-USD", digits: 0 },
  { label: "XRP/USD", symbol: "XRP-USD", digits: 4 },
  { label: "Brent", symbol: "BZ=F", suffix: "USD/bbl", digits: 2 },
];

interface TickerRow {
  label: string;
  symbol: string;
  price: number | null;
  changePct: number | null;
  suffix?: string;
  digits: number;
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const results = await Promise.allSettled(
    SYMBOLS.map((s) => getQuote(s.symbol))
  );

  const rows: TickerRow[] = SYMBOLS.map((s, i) => {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) {
      return {
        label: s.label,
        symbol: s.symbol,
        price: null,
        changePct: null,
        suffix: s.suffix,
        digits: s.digits ?? 2,
      };
    }
    const q = r.value;
    return {
      label: s.label,
      symbol: s.symbol,
      price: q.price,
      changePct: q.changePercent,
      suffix: s.suffix || q.currency,
      digits: s.digits ?? 2,
    };
  });

  return NextResponse.json({ rows, updatedAt: new Date().toISOString() });
}
