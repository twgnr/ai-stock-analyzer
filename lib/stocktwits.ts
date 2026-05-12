/**
 * Stocktwits — eigenständige Plattform für Trader-Sentiment. Zu jedem Ticker
 * einen Stream der jüngsten Beiträge mit Bullish/Bearish-Tags. Ergänzt
 * Reddit-Buzz, weil viele aktive Trader dort posten und das Sentiment
 * explizit per Tag markieren (statt durch Text-Analyse erraten zu müssen).
 *
 * Public API ohne Auth (Anonyme Rate-Limits ~200/h pro IP — für Detail-
 * Seiten-Aufrufe völlig ausreichend, weil wir clientseitig cachen können).
 */

const USER_AGENT =
  process.env.STOCKTWITS_USER_AGENT ||
  "ai-stock-analyzer/1.0 (sentiment-aggregator; respects rate limits)";

export type StocktwitsSentiment = "bullish" | "bearish" | null;

export interface StocktwitsMessage {
  id: number;
  body: string;
  createdAt: string;
  username: string;
  userAvatar?: string;
  sentiment: StocktwitsSentiment;
  url: string;
  likeCount: number;
}

export interface StocktwitsStream {
  ticker: string;
  found: boolean;
  messages: StocktwitsMessage[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  /** Bullish/(Bullish+Bearish) — null wenn niemand getaggt hat. */
  bullishRatio: number | null;
}

export class StocktwitsFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StocktwitsFetchError";
    this.status = status;
  }
}

interface RawMessage {
  id: number;
  body: string;
  created_at: string;
  user: { username: string; avatar_url?: string; avatar_url_ssl?: string };
  entities?: {
    sentiment?: { basic?: string } | null;
  };
  symbols?: Array<{ symbol: string }>;
  likes?: { total: number };
}

interface RawStreamResponse {
  response: { status: number };
  symbol?: { symbol: string };
  messages?: RawMessage[];
}

function stripExchange(ticker: string): string {
  const dot = ticker.indexOf(".");
  return dot > 0 ? ticker.slice(0, dot) : ticker;
}

export async function getStocktwitsStream(
  ticker: string,
  limit = 20
): Promise<StocktwitsStream> {
  const symbol = stripExchange(ticker).toUpperCase();
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(
    symbol
  )}.json?limit=${Math.min(30, Math.max(1, limit))}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  // 404 = Symbol existiert nicht auf Stocktwits (häufig bei deutschen Tickers).
  // Kein Fehler nach außen, einfach „nicht gefunden".
  if (res.status === 404) {
    return {
      ticker: symbol,
      found: false,
      messages: [],
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      bullishRatio: null,
    };
  }
  if (!res.ok) {
    throw new StocktwitsFetchError(
      `Stocktwits ${res.status} ${res.statusText}`,
      res.status
    );
  }

  const data: RawStreamResponse = await res.json();
  const raw = Array.isArray(data.messages) ? data.messages : [];

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  const messages: StocktwitsMessage[] = raw.map((m) => {
    const tag = m.entities?.sentiment?.basic?.toLowerCase();
    let sentiment: StocktwitsSentiment = null;
    if (tag === "bullish") {
      sentiment = "bullish";
      bullishCount++;
    } else if (tag === "bearish") {
      sentiment = "bearish";
      bearishCount++;
    } else {
      neutralCount++;
    }
    return {
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      username: m.user?.username || "?",
      userAvatar: m.user?.avatar_url_ssl || m.user?.avatar_url,
      sentiment,
      url: `https://stocktwits.com/symbol/${symbol}/message/${m.id}`,
      likeCount: m.likes?.total ?? 0,
    };
  });

  const tagged = bullishCount + bearishCount;
  const bullishRatio = tagged > 0 ? bullishCount / tagged : null;

  return {
    ticker: symbol,
    found: true,
    messages,
    bullishCount,
    bearishCount,
    neutralCount,
    bullishRatio,
  };
}
