/**
 * Finnhub-Integration für Einzel-Quote-Fallback.
 *
 * Free-Tier:
 *  - 60 Requests/Minute
 *  - US-Aktien in Echtzeit, andere Börsen 15 Min verzögert (wie Yahoo auch)
 *  - Keine Fundamentals im Gratis-Plan — nur Price/OHLC
 *
 * Die Ticker-Syntax ist weitgehend kompatibel mit Yahoo (z.B. `SAP.DE`,
 * `AAPL`, `VOD.L`). Abweichungen könnten bei US-Pennystocks auftreten,
 * sind für unseren Use-Case aber nebensächlich.
 */

const FINNHUB_BASE = "https://finnhub.io/api/v1";

interface FinnhubQuoteRaw {
  c: number; // current price
  d?: number; // change
  dp?: number; // change percent
  h: number; // day high
  l: number; // day low
  o: number; // open
  pc: number; // previous close
  t: number; // unix timestamp
}

export interface FinnhubQuote {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh?: number;
  dayLow?: number;
  currency: string; // heuristisch abgeleitet
}

function currencyForSymbol(ticker: string): string {
  const t = ticker.toUpperCase();
  if (t.endsWith(".DE") || t.endsWith(".F") || t.endsWith(".BE") || t.endsWith(".MU")) return "EUR";
  if (t.endsWith(".L")) return "GBP";
  if (t.endsWith(".PA") || t.endsWith(".AS") || t.endsWith(".BR") || t.endsWith(".MI") || t.endsWith(".MC")) return "EUR";
  if (t.endsWith(".SW") || t.endsWith(".VX")) return "CHF";
  if (t.endsWith(".TO")) return "CAD";
  if (t.endsWith(".T") || t.endsWith(".JP")) return "JPY";
  if (t.endsWith(".HK")) return "HKD";
  return "USD";
}

/**
 * Parallele Finnhub-Batch-Abfrage. Finnhub hat keine native Batch-API, also
 * feuern wir N Requests parallel — aber gestaffelt in Chunks, um das
 * 60-req/Minute-Limit nicht zu sprengen. Bei 600 Tickern ergibt das Pausen
 * von rund 10 Minuten Gesamtdauer — weit langsamer als Yahoo, dafür robust.
 */
export async function getFinnhubQuotesBatch(
  tickers: string[],
  apiKey: string,
  chunkSize = 10,
  pauseMs = 1100
): Promise<FinnhubQuote[]> {
  if (!apiKey || tickers.length === 0) return [];
  const out: FinnhubQuote[] = [];
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((t) => getFinnhubQuote(t, apiKey))
    );
    for (const r of results) if (r) out.push(r);
    if (i + chunkSize < tickers.length) {
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  return out;
}

/**
 * ── Erweiterte Finnhub-Endpoints für Analytics ────────────────────────────
 *
 * Finnhub liefert auf dem Free-Tier eine Reihe an Analytics-Endpoints, die
 * Yahoo Finance nicht (oder nur unzuverlässig) hat. Wir wrappen die für die
 * KI-Analysen.
 */

export interface FinnhubRecommendationTrend {
  period: string; // "2024-09-01"
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
}

export interface FinnhubPriceTarget {
  /** Mittleres Analyst-Kursziel. */
  targetMean: number;
  /** Median-Kursziel. */
  targetMedian: number;
  targetHigh: number;
  targetLow: number;
  /** Anzahl der Analysten, die zur Berechnung beigetragen haben. */
  numberOfAnalysts: number;
  /** "lastUpdated" als ISO-Datum, wenn von der API geliefert. */
  lastUpdated?: string;
}

export interface FinnhubInsiderSentiment {
  year: number;
  month: number;
  /** Wertet Insider-Käufe vs. Verkäufe; positiv = mehr Käufe. */
  mspr: number;
  /** Net Change, Aktien. */
  change: number;
}

export interface FinnhubEarningsSurprise {
  period: string;
  actual: number;
  estimate: number;
  surprise: number;
  surprisePercent: number;
}

interface FinnhubCacheEntry<T> {
  at: number;
  data: T | null;
}
const analyticsCache = new Map<string, FinnhubCacheEntry<unknown>>();
const ANALYTICS_TTL_MS = 6 * 60 * 60 * 1000;

async function finnhubGet<T>(path: string, apiKey: string): Promise<T | null> {
  if (!apiKey) return null;
  const key = `${path}`;
  const hit = analyticsCache.get(key) as FinnhubCacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ANALYTICS_TTL_MS) return hit.data;
  try {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${FINNHUB_BASE}${path}${sep}token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 429) console.warn(`[finnhub] rate-limited (${path})`);
      else if (res.status === 401 || res.status === 403)
        console.warn(`[finnhub] auth failed (${res.status})`);
      else console.warn(`[finnhub] ${path} → ${res.status}`);
      analyticsCache.set(key, { at: Date.now(), data: null });
      return null;
    }
    const data = (await res.json()) as T;
    analyticsCache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.warn(`[finnhub] fetch error ${path}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getFinnhubRecommendationTrends(
  ticker: string,
  apiKey: string
): Promise<FinnhubRecommendationTrend[] | null> {
  const data = await finnhubGet<FinnhubRecommendationTrend[]>(
    `/stock/recommendation?symbol=${encodeURIComponent(ticker)}`,
    apiKey
  );
  if (!Array.isArray(data) || data.length === 0) return null;
  return data;
}

export async function getFinnhubPriceTarget(
  ticker: string,
  apiKey: string
): Promise<FinnhubPriceTarget | null> {
  interface Raw {
    targetMean: number;
    targetMedian: number;
    targetHigh: number;
    targetLow: number;
    numberOfAnalysts: number;
    lastUpdated?: string;
  }
  const data = await finnhubGet<Raw>(
    `/stock/price-target?symbol=${encodeURIComponent(ticker)}`,
    apiKey
  );
  if (!data || !data.targetMean || data.numberOfAnalysts === 0) return null;
  return data;
}

export async function getFinnhubInsiderSentiment(
  ticker: string,
  apiKey: string
): Promise<FinnhubInsiderSentiment[] | null> {
  // Letzte 6 Monate
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  interface Raw {
    data?: FinnhubInsiderSentiment[];
  }
  const data = await finnhubGet<Raw>(
    `/stock/insider-sentiment?symbol=${encodeURIComponent(
      ticker
    )}&from=${fmt(from)}&to=${fmt(to)}`,
    apiKey
  );
  if (!data?.data || data.data.length === 0) return null;
  return data.data;
}

export async function getFinnhubEarningsSurprises(
  ticker: string,
  apiKey: string
): Promise<FinnhubEarningsSurprise[] | null> {
  interface Raw {
    period: string;
    actual: number;
    estimate: number;
    surprise: number;
    surprisePercent: number;
  }
  const data = await finnhubGet<Raw[]>(
    `/stock/earnings?symbol=${encodeURIComponent(ticker)}&limit=4`,
    apiKey
  );
  if (!Array.isArray(data) || data.length === 0) return null;
  return data;
}

export interface FinnhubAnalyticsSummary {
  recommendation?: {
    period: string;
    buy: number;
    hold: number;
    sell: number;
    strongBuy: number;
    strongSell: number;
  };
  priceTarget?: FinnhubPriceTarget;
  insiderSentiment?: { mspr: number; latest: FinnhubInsiderSentiment };
  earningsSurprises?: FinnhubEarningsSurprise[];
}

/**
 * Sammelt alle Analytics-Endpoints in einem Aufruf. Robuste Promise.allSettled-
 * Semantik: scheitert ein Endpoint, fehlt das Feld einfach, statt das ganze
 * Objekt zu killen.
 */
export async function getFinnhubAnalytics(
  ticker: string,
  apiKey: string
): Promise<FinnhubAnalyticsSummary> {
  if (!apiKey) return {};
  const [trends, target, sentiment, earnings] = await Promise.allSettled([
    getFinnhubRecommendationTrends(ticker, apiKey),
    getFinnhubPriceTarget(ticker, apiKey),
    getFinnhubInsiderSentiment(ticker, apiKey),
    getFinnhubEarningsSurprises(ticker, apiKey),
  ]);

  const summary: FinnhubAnalyticsSummary = {};

  if (trends.status === "fulfilled" && trends.value && trends.value.length > 0) {
    // Finnhub liefert Array sortiert (newest first). Wir nehmen den jüngsten.
    const latest = trends.value[0];
    summary.recommendation = {
      period: latest.period,
      buy: latest.buy,
      hold: latest.hold,
      sell: latest.sell,
      strongBuy: latest.strongBuy,
      strongSell: latest.strongSell,
    };
  }
  if (target.status === "fulfilled" && target.value) {
    summary.priceTarget = target.value;
  }
  if (sentiment.status === "fulfilled" && sentiment.value && sentiment.value.length > 0) {
    const sorted = [...sentiment.value].sort(
      (a, b) => b.year * 12 + b.month - (a.year * 12 + a.month)
    );
    const latest = sorted[0];
    const avgMspr =
      sentiment.value.reduce((s, x) => s + x.mspr, 0) / sentiment.value.length;
    summary.insiderSentiment = { mspr: avgMspr, latest };
  }
  if (earnings.status === "fulfilled" && earnings.value && earnings.value.length > 0) {
    summary.earningsSurprises = earnings.value;
  }

  return summary;
}

/**
 * Kompakter Prompt-Block für die KI.
 */
export function formatFinnhubAnalyticsForPrompt(s: FinnhubAnalyticsSummary): string {
  const lines: string[] = [];
  if (s.recommendation) {
    const r = s.recommendation;
    const total = r.buy + r.hold + r.sell + r.strongBuy + r.strongSell;
    if (total > 0) {
      lines.push(
        `Analysten-Konsens (${r.period}, n=${total}): StrongBuy=${r.strongBuy}, Buy=${r.buy}, Hold=${r.hold}, Sell=${r.sell}, StrongSell=${r.strongSell}`
      );
    }
  }
  if (s.priceTarget) {
    const t = s.priceTarget;
    lines.push(
      `Analyst-Kursziele (${t.numberOfAnalysts} Analysten): Ø ${t.targetMean.toFixed(2)}, Median ${t.targetMedian.toFixed(2)}, Range ${t.targetLow.toFixed(2)}–${t.targetHigh.toFixed(2)}`
    );
  }
  if (s.insiderSentiment) {
    const i = s.insiderSentiment;
    const lbl =
      i.mspr > 30
        ? "klar bullisch"
        : i.mspr > 0
          ? "leicht bullisch"
          : i.mspr < -30
            ? "klar bärisch"
            : i.mspr < 0
              ? "leicht bärisch"
              : "neutral";
    lines.push(
      `Insider-Sentiment (Finnhub MSPR Ø 6M): ${i.mspr.toFixed(1)} → ${lbl} (latest ${i.latest.year}-${String(i.latest.month).padStart(2, "0")}: ${i.latest.change} Aktien)`
    );
  }
  if (s.earningsSurprises && s.earningsSurprises.length > 0) {
    lines.push("Earnings-Surprises (letzte Quartale):");
    for (const e of s.earningsSurprises.slice(0, 4)) {
      lines.push(
        `  ${e.period}: actual ${e.actual.toFixed(2)} vs. est ${e.estimate.toFixed(2)} (${e.surprisePercent >= 0 ? "+" : ""}${e.surprisePercent.toFixed(1)}%)`
      );
    }
  }
  if (lines.length === 0) return "";
  return ["=== ANALYST/INSIDER (Finnhub) ===", ...lines].join("\n");
}

export async function getFinnhubQuote(
  ticker: string,
  apiKey: string
): Promise<FinnhubQuote | null> {
  if (!apiKey) return null;
  try {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[finnhub] rate-limited for ${ticker}`);
      } else if (res.status === 401 || res.status === 403) {
        console.warn(`[finnhub] auth failed (${res.status}) — Key prüfen`);
      }
      return null;
    }
    const data = (await res.json()) as FinnhubQuoteRaw;
    // Finnhub liefert bei unbekanntem Symbol ein Objekt mit c=0, alle anderen Werten 0
    if (!data || !data.c || data.c === 0) return null;
    const prev = data.pc || data.c;
    return {
      ticker: ticker.toUpperCase(),
      price: data.c,
      previousClose: prev,
      change: data.d ?? data.c - prev,
      changePercent: data.dp ?? (prev ? ((data.c - prev) / prev) * 100 : 0),
      dayHigh: data.h || undefined,
      dayLow: data.l || undefined,
      currency: currencyForSymbol(ticker),
    };
  } catch (e) {
    console.warn(`[finnhub] fetch error for ${ticker}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
