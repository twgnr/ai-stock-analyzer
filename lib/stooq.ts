/**
 * Stooq-Fallback für Quotes. Stooq liefert CSV ohne Rate-Limit und ohne API-Key,
 * allerdings nur verzögert und mit weniger Markt-Metadaten als Yahoo. Deshalb
 * nur als Fallback gedacht, wenn Yahoo throtteln oder nichts liefert.
 */

const STOOQ_URL = "https://stooq.com/q/l/";

function mapYahooToStooq(ticker: string): string {
  const t = ticker.toUpperCase();
  if (t.includes(".")) {
    // NESN.SW → NESN.CH (Schweiz), der Rest passt meist 1:1
    if (t.endsWith(".SW")) return t.slice(0, -3) + ".CH";
    if (t.endsWith(".TO")) return t.slice(0, -3) + ".CA"; // Toronto
    return t;
  }
  // Keine Suffix → nehmen wir als US an (Apple, MSFT, etc.)
  return t + ".US";
}

export interface StooqQuote {
  ticker: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  date?: string;
  name?: string;
}

export async function getStooqQuote(ticker: string): Promise<StooqQuote | null> {
  const stooqTicker = mapYahooToStooq(ticker);
  try {
    const res = await fetch(
      `${STOOQ_URL}?s=${encodeURIComponent(stooqTicker.toLowerCase())}&f=sd2t2ohlcvn&h&e=csv`,
      {
        headers: { "User-Agent": "Mozilla/5.0 StockAnalysis" },
        // 5s Timeout via AbortController
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const row = lines[1].split(",");
    const [, date, , openS, highS, lowS, closeS, volS, name] = row;
    const close = parseFloat(closeS);
    if (!Number.isFinite(close) || close <= 0) return null;
    return {
      ticker,
      price: close,
      open: parseFloat(openS) || undefined,
      high: parseFloat(highS) || undefined,
      low: parseFloat(lowS) || undefined,
      volume: parseFloat(volS) || undefined,
      date,
      name: (name || "").replace(/"/g, "").trim() || undefined,
    };
  } catch {
    return null;
  }
}
