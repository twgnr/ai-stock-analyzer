import YahooFinance from "yahoo-finance2";
import { getStooqQuote } from "./stooq";
import { assertYahooQuota, incrementYahooUsage, YahooQuotaError } from "./yahooQuota";
import { getFinnhubQuote } from "./finnhub";
import { getProviderConfig, type QuoteProviderKey } from "./quoteProvider";

// Die roh-Instanz von yahoo-finance2 — wird ausschließlich intern vom
// getrackten Proxy verwendet.
const rawYahoo = new YahooFinance();

// Proxy-Wrapper: jeder Methoden-Aufruf (quote, quoteSummary, chart, search,
// screener, ...) wird gegen das Admin-Tageslimit geprüft und zählt im
// Erfolgsfall gegen den Tages-Counter. Nicht-Funktionen werden durchgereicht,
// damit statische Properties unverändert bleiben.
type YahooClient = typeof rawYahoo;

export const yahooFinance: YahooClient = new Proxy(rawYahoo, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);
    if (typeof orig !== "function") return orig;
    return async function tracked(this: unknown, ...args: unknown[]) {
      await assertYahooQuota();
      const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(
        target,
        args
      );
      incrementYahooUsage(1);
      return result;
    };
  },
}) as unknown as YahooClient;

export { YahooQuotaError };

export interface Quote {
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  exchange?: string;
  /** Quelle — für Debug/Transparenz */
  source?: QuoteProviderKey;
}

// In-Memory-Cache (TTL 15 min). Dient als zentrale Drossel für Yahoo-Calls:
// alle User teilen sich den Cache, sodass die Yahoo-Last nicht mit User- oder
// Tab-Zahl skaliert, sondern nur mit den unique Tickern und den konfigurierten
// Refresh-Intervallen im Client. Für Multi-Instance-Setups würde ein geteilter
// Cache (Redis) mehr Sinn machen; das ist nicht installiert.
const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;
const quoteCache = new Map<string, { at: number; q: Quote }>();

function cachedQuote(ticker: string): Quote | null {
  const hit = quoteCache.get(ticker.toUpperCase());
  if (!hit) return null;
  if (Date.now() - hit.at > QUOTE_CACHE_TTL_MS) {
    quoteCache.delete(ticker.toUpperCase());
    return null;
  }
  return hit.q;
}

function rememberQuote(q: Quote): Quote {
  quoteCache.set(q.ticker.toUpperCase(), { at: Date.now(), q });
  return q;
}

async function fetchFromYahoo(ticker: string): Promise<Quote | null> {
  try {
    const q = await yahooFinance.quote(ticker);
    if (!q || !q.regularMarketPrice) return null;
    const price = q.regularMarketPrice;
    const prev = q.regularMarketPreviousClose ?? price;
    return {
      ticker: q.symbol,
      name: q.longName || q.shortName || q.symbol,
      price,
      previousClose: prev,
      change: price - prev,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      currency: q.currency || "USD",
      marketState: q.marketState || "REGULAR",
      dayHigh: q.regularMarketDayHigh,
      dayLow: q.regularMarketDayLow,
      volume: q.regularMarketVolume,
      marketCap: q.marketCap,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      exchange: q.fullExchangeName,
      source: "yahoo",
    };
  } catch (e) {
    console.warn(
      `[yahoo] quote error for ${ticker}:`,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

async function fetchFromStooq(ticker: string): Promise<Quote | null> {
  const s = await getStooqQuote(ticker);
  if (!s) return null;
  // Stooq kennt weder changePercent-Referenz (vorherige Close) noch 52W-Range.
  // Wir setzen previousClose = price, damit change/changePercent 0 sind.
  return {
    ticker: ticker.toUpperCase(),
    name: s.name || ticker.toUpperCase(),
    price: s.price,
    previousClose: s.price,
    change: 0,
    changePercent: 0,
    currency: "USD",
    marketState: "STOOQ",
    dayHigh: s.high,
    dayLow: s.low,
    volume: s.volume,
    source: "stooq",
  };
}

async function fetchFromFinnhub(
  ticker: string,
  apiKey: string
): Promise<Quote | null> {
  const q = await getFinnhubQuote(ticker, apiKey);
  if (!q) return null;
  return {
    ticker: q.ticker,
    name: q.ticker, // Finnhub /quote liefert keinen Namen; Yahoo-Wrapper würde profile2 brauchen
    price: q.price,
    previousClose: q.previousClose,
    change: q.change,
    changePercent: q.changePercent,
    currency: q.currency,
    marketState: "REGULAR",
    dayHigh: q.dayHigh,
    dayLow: q.dayLow,
    source: "finnhub",
  };
}

async function fetchFromProvider(
  provider: QuoteProviderKey,
  ticker: string,
  finnhubKey: string
): Promise<Quote | null> {
  try {
    if (provider === "yahoo") return await fetchFromYahoo(ticker);
    if (provider === "finnhub") {
      if (!finnhubKey) return null;
      return await fetchFromFinnhub(ticker, finnhubKey);
    }
    if (provider === "stooq") return await fetchFromStooq(ticker);
    return null;
  } catch (e) {
    // Yahoo-Quota-Fehler explizit beibehalten, damit Aufrufer ihn sehen können
    if (e instanceof YahooQuotaError) throw e;
    console.warn(
      `[quote-provider] ${provider} error for ${ticker}:`,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

export async function getQuote(ticker: string): Promise<Quote> {
  const cached = cachedQuote(ticker);
  if (cached) return cached;

  const cfg = await getProviderConfig();
  const activeProviders = cfg.order.filter((p) => cfg.enabled[p]);
  if (activeProviders.length === 0) {
    throw new Error("Alle Kurs-Provider sind vom Admin deaktiviert.");
  }
  const triedNames: string[] = [];
  for (const provider of activeProviders) {
    triedNames.push(provider);
    const q = await fetchFromProvider(provider, ticker, cfg.finnhubApiKey);
    if (q) return rememberQuote(q);
  }
  throw new Error(
    `Kein Kurs für ${ticker} (Provider-Kaskade erschöpft: ${triedNames.join(" → ")})`
  );
}

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  const results = await Promise.allSettled(tickers.map((t) => getQuote(t)));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[yahoo] Kein Kurs für ${tickers[i]}:`, r.reason?.message || r.reason);
    }
  });
  return results
    .filter((r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled")
    .map((r) => r.value);
}

export interface ScreenerQuote extends Quote {
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  priceToBook?: number;
  epsTTM?: number;
  sharesOutstanding?: number;
  beta?: number;
}

export async function getQuotesBatch(tickers: string[]): Promise<ScreenerQuote[]> {
  if (tickers.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 50) {
    chunks.push(tickers.slice(i, i + 50));
  }

  const all: ScreenerQuote[] = [];
  for (const chunk of chunks) {
    try {
      const results = await yahooFinance.quote(chunk);
      const list = Array.isArray(results) ? results : [results];
      for (const q of list) {
        if (!q || !q.regularMarketPrice) continue;
        const price = q.regularMarketPrice;
        const prev = q.regularMarketPreviousClose ?? price;
        all.push({
          ticker: q.symbol,
          name: q.longName || q.shortName || q.symbol,
          price,
          previousClose: prev,
          change: price - prev,
          changePercent: prev ? ((price - prev) / prev) * 100 : 0,
          currency: q.currency || "USD",
          marketState: q.marketState || "REGULAR",
          dayHigh: q.regularMarketDayHigh,
          dayLow: q.regularMarketDayLow,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          exchange: q.fullExchangeName,
          trailingPE: q.trailingPE,
          forwardPE: q.forwardPE,
          dividendYield: q.dividendYield,
          priceToBook: q.priceToBook,
          epsTTM: q.epsTrailingTwelveMonths,
          sharesOutstanding: q.sharesOutstanding,
        });
      }
    } catch (e) {
      console.error("[yahoo] Batch-Abruf fehlgeschlagen:", e instanceof Error ? e.message : e);
    }
  }
  return all;
}

export type ChartRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";
export type ChartInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function rangeToDates(range: ChartRange): { period1: Date; period2: Date } {
  const period2 = new Date();
  const period1 = new Date();
  switch (range) {
    case "1d": period1.setDate(period2.getDate() - 2); break;
    case "5d": period1.setDate(period2.getDate() - 7); break;
    case "1mo": period1.setMonth(period2.getMonth() - 1); break;
    case "3mo": period1.setMonth(period2.getMonth() - 3); break;
    case "6mo": period1.setMonth(period2.getMonth() - 6); break;
    case "1y": period1.setFullYear(period2.getFullYear() - 1); break;
    case "2y": period1.setFullYear(period2.getFullYear() - 2); break;
    case "5y": period1.setFullYear(period2.getFullYear() - 5); break;
    case "max": period1.setFullYear(period2.getFullYear() - 20); break;
  }
  return { period1, period2 };
}

export async function getChart(
  ticker: string,
  range: ChartRange = "6mo",
  interval: ChartInterval = "1d"
): Promise<Candle[]> {
  const { period1, period2 } = rangeToDates(range);
  const result = await yahooFinance.chart(ticker, { period1, period2, interval });
  return (result.quotes || [])
    .filter((q) => q.close != null && q.open != null && q.high != null && q.low != null)
    .map((q) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume ?? 0,
    }));
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  summary?: string;
}

export async function getNews(ticker: string, count = 10): Promise<NewsItem[]> {
  try {
    const result = await yahooFinance.search(ticker, { newsCount: count, quotesCount: 0 });
    return (result.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: new Date(n.providerPublishTime).toISOString(),
      summary: undefined,
    }));
  } catch {
    return [];
  }
}

export interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const result = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 });
  return (result.quotes || [])
    .filter((q): q is typeof q & { symbol: string } => "symbol" in q && typeof q.symbol === "string")
    .map((q) => ({
      ticker: q.symbol,
      name: String(
        ("longname" in q && q.longname) ||
          ("shortname" in q && q.shortname) ||
          q.symbol
      ),
      exchange: String(
        ("exchDisp" in q && q.exchDisp) ||
          ("exchange" in q && q.exchange) ||
          ""
      ),
      type: String(
        ("typeDisp" in q && q.typeDisp) ||
          ("quoteType" in q && q.quoteType) ||
          ""
      ),
    }));
}

export type ScreenerPredefined =
  | "aggressive_small_caps"
  | "small_cap_gainers"
  | "day_gainers"
  | "day_losers"
  | "growth_technology_stocks"
  | "most_actives"
  | "most_shorted_stocks"
  | "undervalued_growth_stocks"
  | "undervalued_large_caps";

export interface ScreenerRow {
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  exchange?: string;
  firstTradeDate?: Date;
}

export async function runYahooScreener(
  scrId: ScreenerPredefined,
  count = 50
): Promise<ScreenerRow[]> {
  try {
    const result = await yahooFinance.screener({ scrIds: scrId, count });
    const quotes = (result as { quotes?: unknown[] }).quotes || [];
    return quotes
      .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
      .map((q) => {
        const price = (q.regularMarketPrice as number) ?? 0;
        const prev = (q.regularMarketPreviousClose as number) ?? price;
        const ftd = q.firstTradeDateMilliseconds as number | undefined;
        return {
          ticker: String(q.symbol || ""),
          name: String(q.longName || q.shortName || q.symbol || ""),
          price,
          previousClose: prev,
          change: price - prev,
          changePercent: prev ? ((price - prev) / prev) * 100 : 0,
          currency: String(q.currency || "USD"),
          marketCap: q.marketCap as number | undefined,
          trailingPE: q.trailingPE as number | undefined,
          forwardPE: q.forwardPE as number | undefined,
          dividendYield: q.dividendYield as number | undefined,
          volume: q.regularMarketVolume as number | undefined,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh as number | undefined,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow as number | undefined,
          exchange: String(q.fullExchangeName || ""),
          firstTradeDate: ftd ? new Date(ftd) : undefined,
        };
      })
      .filter((r) => r.ticker && r.price > 0);
  } catch (e) {
    console.error("[yahoo-screener]", scrId, e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getQuotesWithIPODates(tickers: string[]): Promise<ScreenerRow[]> {
  if (tickers.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 50) {
    chunks.push(tickers.slice(i, i + 50));
  }

  const all: ScreenerRow[] = [];
  for (const chunk of chunks) {
    try {
      const results = await yahooFinance.quote(chunk);
      const list = Array.isArray(results) ? results : [results];
      for (const q of list) {
        if (!q || !q.regularMarketPrice) continue;
        const price = q.regularMarketPrice;
        const prev = q.regularMarketPreviousClose ?? price;
        const ftd = (q as { firstTradeDateMilliseconds?: number }).firstTradeDateMilliseconds;
        all.push({
          ticker: q.symbol,
          name: q.longName || q.shortName || q.symbol,
          price,
          previousClose: prev,
          change: price - prev,
          changePercent: prev ? ((price - prev) / prev) * 100 : 0,
          currency: q.currency || "USD",
          marketCap: q.marketCap,
          trailingPE: q.trailingPE,
          forwardPE: q.forwardPE,
          dividendYield: q.dividendYield,
          volume: q.regularMarketVolume,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          exchange: q.fullExchangeName,
          firstTradeDate: ftd ? new Date(ftd) : undefined,
        });
      }
    } catch (e) {
      console.error("[yahoo-ipo]", e instanceof Error ? e.message : e);
    }
  }
  return all;
}

export interface EarningsHistoryPoint {
  date: string;
  actual?: number;
  estimate?: number;
  surprisePercent?: number;
}

export interface EarningsInfo {
  lastEarningsDate?: string;
  nextEarningsDate?: string;
  quarterlyEPS: EarningsHistoryPoint[];
  quarterlyRevenue: EarningsHistoryPoint[];
  upcomingEstimate?: { eps?: number; revenue?: number };
}

export async function getEarningsData(ticker: string): Promise<EarningsInfo | null> {
  try {
    const s = await yahooFinance.quoteSummary(ticker, {
      modules: ["earnings", "earningsHistory", "calendarEvents", "earningsTrend"],
    });
    const quarterlyEPS: EarningsHistoryPoint[] = [];
    const quarterlyRevenue: EarningsHistoryPoint[] = [];

    const eChart = s.earnings?.earningsChart?.quarterly || [];
    const fChart = s.earnings?.financialsChart?.quarterly || [];
    for (const q of eChart) {
      quarterlyEPS.push({
        date: String(q.date),
        actual: q.actual ?? undefined,
        estimate: q.estimate ?? undefined,
        surprisePercent:
          q.actual != null && q.estimate != null && q.estimate !== 0
            ? ((q.actual - q.estimate) / Math.abs(q.estimate)) * 100
            : undefined,
      });
    }
    for (const q of fChart) {
      quarterlyRevenue.push({ date: String(q.date), actual: q.revenue ?? undefined });
    }

    const history = s.earningsHistory?.history || [];
    for (const h of history) {
      const existing = quarterlyEPS.find((e) => e.date === String(h.quarter));
      if (!existing && h.quarter) {
        quarterlyEPS.push({
          date: String(h.quarter),
          actual: h.epsActual ?? undefined,
          estimate: h.epsEstimate ?? undefined,
          surprisePercent:
            h.epsActual != null && h.epsEstimate != null && h.epsEstimate !== 0
              ? ((h.epsActual - h.epsEstimate) / Math.abs(h.epsEstimate)) * 100
              : undefined,
        });
      }
    }

    const nextDates = s.calendarEvents?.earnings?.earningsDate;
    const lastEarningsDate = s.earnings?.earningsChart?.currentQuarterEstimateDate;

    return {
      lastEarningsDate,
      nextEarningsDate: nextDates?.[0] ? String(nextDates[0]) : undefined,
      quarterlyEPS,
      quarterlyRevenue,
      upcomingEstimate: {
        eps: s.earnings?.earningsChart?.currentQuarterEstimate,
      },
    };
  } catch {
    return null;
  }
}

// ============================================================
// Insider-Trades (Form-4-Transaktionen)
// ============================================================

export interface InsiderTrade {
  name?: string;
  relation?: string;
  transactionText?: string;
  /** Anzahl Aktien mit Vorzeichen (neg = Sale) */
  shares?: number;
  value?: number;
  date?: string;
  filerUrl?: string;
}

export async function getInsiderTrades(ticker: string): Promise<InsiderTrade[]> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["insiderTransactions"],
    });
    const list = summary.insiderTransactions?.transactions || [];
    return list.slice(0, 30).map((t) => ({
      name: t.filerName,
      relation: t.filerRelation,
      transactionText: t.transactionText,
      shares: t.shares,
      value: t.value,
      date: t.startDate
        ? new Date(t.startDate).toISOString().slice(0, 10)
        : undefined,
      filerUrl: t.filerUrl,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Dividenden-Termine (Ex-Dividend-Date und Historie)
// ============================================================

export type PayoutFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "irregular"
  | "none";

export interface DividendInfo {
  ticker: string;
  name?: string;
  currency: string;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  payDate?: string;
  payoutRatio?: number;
  /** Historie: älteste zuerst */
  history: Array<{ date: string; amount: number }>;
  /** Anzahl Zahlungen in den letzten 365 Tagen */
  payoutsPerYear: number;
  /** Label abgeleitet aus payoutsPerYear */
  payoutFrequency: PayoutFrequency;
  /** Jährliche Dividendensumme pro Kalenderjahr, sortiert aufsteigend */
  annualHistory: Array<{ year: number; total: number }>;
  /** CAGR der jährlichen Dividendensumme über N Jahre, in Prozent */
  growthCagr3y: number | null;
  growthCagr5y: number | null;
  growthCagr10y: number | null;
  /** Streak an Jahren in Folge mit nicht-fallender Dividendensumme */
  dividendGrowthStreakYears: number;
}

function buildAnnualHistory(
  history: Array<{ date: string; amount: number }>
): Array<{ year: number; total: number }> {
  const byYear = new Map<number, number>();
  for (const h of history) {
    const y = parseInt(h.date.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    byYear.set(y, (byYear.get(y) || 0) + h.amount);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, total]) => ({ year, total }));
}

function cagrOverNYears(
  annual: Array<{ year: number; total: number }>,
  n: number
): number | null {
  if (annual.length < n + 1) return null;
  // Nur vollständige Kalenderjahre — laufendes Jahr ausschließen
  const currentYear = new Date().getUTCFullYear();
  const completed = annual.filter((a) => a.year < currentYear);
  if (completed.length < n + 1) return null;
  const end = completed[completed.length - 1];
  const start = completed[completed.length - 1 - n];
  if (start.total <= 0 || end.total <= 0) return null;
  return (Math.pow(end.total / start.total, 1 / n) - 1) * 100;
}

function growthStreak(
  annual: Array<{ year: number; total: number }>
): number {
  const currentYear = new Date().getUTCFullYear();
  const completed = annual.filter((a) => a.year < currentYear);
  if (completed.length < 2) return 0;
  let streak = 0;
  for (let i = completed.length - 1; i > 0; i--) {
    const cur = completed[i].total;
    const prev = completed[i - 1].total;
    if (cur >= prev && cur > 0) streak++;
    else break;
  }
  return streak;
}

function inferFrequency(
  history: Array<{ date: string; amount: number }>
): { payoutsPerYear: number; payoutFrequency: PayoutFrequency } {
  if (history.length === 0) {
    return { payoutsPerYear: 0, payoutFrequency: "none" };
  }
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const lastYearCount = history.filter(
    (h) => new Date(h.date + "T00:00:00Z").getTime() >= yearAgo
  ).length;

  // Gap-basiertes Label (robuster gegen Lücken am Rand des 12M-Fensters)
  const recent = history.slice(-6);
  let avgGapDays = 0;
  if (recent.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const d1 = new Date(recent[i - 1].date + "T00:00:00Z").getTime();
      const d2 = new Date(recent[i].date + "T00:00:00Z").getTime();
      gaps.push((d2 - d1) / (24 * 60 * 60 * 1000));
    }
    avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  }

  let freq: PayoutFrequency = "irregular";
  if (lastYearCount === 0) freq = "none";
  else if (avgGapDays >= 20 && avgGapDays <= 40) freq = "monthly";
  else if (avgGapDays >= 75 && avgGapDays <= 105) freq = "quarterly";
  else if (avgGapDays >= 150 && avgGapDays <= 210) freq = "semiannual";
  else if (avgGapDays >= 300 && avgGapDays <= 420) freq = "annual";

  return { payoutsPerYear: lastYearCount, payoutFrequency: freq };
}

export async function getDividendInfo(ticker: string): Promise<DividendInfo | null> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "summaryDetail",
        "calendarEvents",
        "price",
        "defaultKeyStatistics",
      ],
    });
    const dividendRate = summary.summaryDetail?.dividendRate;
    const dividendYield = summary.summaryDetail?.dividendYield;
    const exDate = summary.calendarEvents?.exDividendDate;
    const payoutRatio = summary.summaryDetail?.payoutRatio;
    if (dividendRate == null && !exDate) return null;

    // Historische Dividenden via Chart events=div (11 Jahre, damit 10J-CAGR messbar ist)
    let history: Array<{ date: string; amount: number }> = [];
    try {
      const since = new Date();
      since.setFullYear(since.getFullYear() - 11);
      const chart = await yahooFinance.chart(ticker, {
        period1: since,
        interval: "1d",
        events: "div",
      });
      const events = chart.events?.dividends || [];
      history = events
        .map((e) => ({
          date: new Date(e.date).toISOString().slice(0, 10),
          amount: e.amount,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    } catch {
      // ignore — history optional
    }

    const payDate = summary.calendarEvents?.dividendDate;
    const freq = inferFrequency(history);
    const annualHistory = buildAnnualHistory(history);

    return {
      ticker: ticker.toUpperCase(),
      name: summary.price?.longName || summary.price?.shortName || undefined,
      currency: summary.price?.currency || "USD",
      dividendRate,
      dividendYield,
      exDividendDate: exDate ? new Date(exDate).toISOString().slice(0, 10) : undefined,
      payDate: payDate ? new Date(payDate).toISOString().slice(0, 10) : undefined,
      payoutRatio,
      history,
      payoutsPerYear: freq.payoutsPerYear,
      payoutFrequency: freq.payoutFrequency,
      annualHistory,
      growthCagr3y: cagrOverNYears(annualHistory, 3),
      growthCagr5y: cagrOverNYears(annualHistory, 5),
      growthCagr10y: cagrOverNYears(annualHistory, 10),
      dividendGrowthStreakYears: growthStreak(annualHistory),
    };
  } catch {
    return null;
  }
}

export async function getFundamentals(ticker: string) {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price", "summaryProfile"],
    });
    return {
      sector: summary.summaryProfile?.sector,
      industry: summary.summaryProfile?.industry,
      country: summary.summaryProfile?.country,
      website: summary.summaryProfile?.website,
      businessSummary: summary.summaryProfile?.longBusinessSummary,
      peRatio: summary.summaryDetail?.trailingPE,
      forwardPe: summary.summaryDetail?.forwardPE,
      dividendYield: summary.summaryDetail?.dividendYield,
      marketCap: summary.price?.marketCap,
      beta: summary.summaryDetail?.beta,
      profitMargin: summary.financialData?.profitMargins,
      operatingMargin: summary.financialData?.operatingMargins,
      revenueGrowth: summary.financialData?.revenueGrowth,
      earningsGrowth: summary.financialData?.earningsGrowth,
      debtToEquity: summary.financialData?.debtToEquity,
      recommendationMean: summary.financialData?.recommendationMean,
      recommendationKey: summary.financialData?.recommendationKey,
      targetMeanPrice: summary.financialData?.targetMeanPrice,
      numberOfAnalysts: summary.financialData?.numberOfAnalystOpinions,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Financials (Income / Balance / Cashflow) für Fundamental-Scores
// ============================================================

export interface FinancialRow {
  endDate: string;
  // Income Statement
  totalRevenue?: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  ebit?: number;
  netIncome?: number;
  sga?: number;
  depreciation?: number;
  // Balance Sheet
  totalAssets?: number;
  totalCurrentAssets?: number;
  totalCurrentLiabilities?: number;
  totalLiab?: number;
  longTermDebt?: number;
  retainedEarnings?: number;
  commonStock?: number;
  cashAndEquivalents?: number;
  receivables?: number;
  netPpe?: number;
  shortTermDebt?: number;
  // Cashflow
  operatingCashflow?: number;
  capitalExpenditures?: number;
  dividendsPaid?: number;
  repurchaseOfStock?: number;
  issuanceOfStock?: number;
  netIssuanceOfDebt?: number;
}

export interface FinancialsHistory {
  annual: FinancialRow[];
  currency: string;
}

type YFItem = { endDate?: Date | string; raw?: number } & Record<string, unknown>;

function extractAnnualRow(
  incomeHist: Array<Record<string, YFItem | undefined>>,
  balanceHist: Array<Record<string, YFItem | undefined>>,
  cashflowHist: Array<Record<string, YFItem | undefined>>
): FinancialRow[] {
  const byDate = new Map<string, FinancialRow>();
  const dateKey = (d: Date | string | undefined): string => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toISOString().slice(0, 10);
  };

  const val = (item: YFItem | undefined): number | undefined => {
    if (!item) return undefined;
    if (typeof item === "number") return item;
    const n = (item as { raw?: number }).raw;
    return typeof n === "number" ? n : undefined;
  };

  for (const i of incomeHist) {
    const k = dateKey(i.endDate as Date | string | undefined);
    if (!k) continue;
    const row: FinancialRow = byDate.get(k) || { endDate: k };
    row.totalRevenue = val(i.totalRevenue);
    row.costOfRevenue = val(i.costOfRevenue);
    row.grossProfit = val(i.grossProfit);
    row.operatingIncome = val(i.operatingIncome);
    row.ebit = val(i.ebit) ?? row.operatingIncome;
    row.netIncome = val(i.netIncome);
    row.sga = val(i.sellingGeneralAdministrative);
    byDate.set(k, row);
  }
  for (const b of balanceHist) {
    const k = dateKey(b.endDate as Date | string | undefined);
    if (!k) continue;
    const row: FinancialRow = byDate.get(k) || { endDate: k };
    row.totalAssets = val(b.totalAssets);
    row.totalCurrentAssets = val(b.totalCurrentAssets);
    row.totalCurrentLiabilities = val(b.totalCurrentLiabilities);
    row.totalLiab = val(b.totalLiab);
    row.longTermDebt = val(b.longTermDebt);
    row.retainedEarnings = val(b.retainedEarnings);
    row.commonStock = val(b.commonStock);
    row.cashAndEquivalents = val(b.cash) ?? val(b.shortTermInvestments);
    row.receivables = val(b.netReceivables);
    row.netPpe = val(b.propertyPlantEquipment);
    row.shortTermDebt = val(b.shortLongTermDebt);
    byDate.set(k, row);
  }
  for (const c of cashflowHist) {
    const k = dateKey(c.endDate as Date | string | undefined);
    if (!k) continue;
    const row: FinancialRow = byDate.get(k) || { endDate: k };
    row.operatingCashflow = val(c.totalCashFromOperatingActivities);
    row.capitalExpenditures = val(c.capitalExpenditures);
    row.dividendsPaid = val(c.dividendsPaid);
    row.repurchaseOfStock = val(c.repurchaseOfStock);
    row.issuanceOfStock = val(c.issuanceOfStock);
    row.netIssuanceOfDebt = val(c.netBorrowings);
    row.depreciation = val(c.depreciation);
    byDate.set(k, row);
  }

  return [...byDate.values()].sort((a, b) => (a.endDate < b.endDate ? 1 : -1));
}

export async function getFinancialsHistory(
  ticker: string
): Promise<FinancialsHistory | null> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "price",
      ],
    });
    const incomeHist =
      (summary.incomeStatementHistory?.incomeStatementHistory as unknown as Array<
        Record<string, YFItem | undefined>
      >) || [];
    const balanceHist =
      (summary.balanceSheetHistory?.balanceSheetStatements as unknown as Array<
        Record<string, YFItem | undefined>
      >) || [];
    const cashflowHist =
      (summary.cashflowStatementHistory?.cashflowStatements as unknown as Array<
        Record<string, YFItem | undefined>
      >) || [];

    const annual = extractAnnualRow(incomeHist, balanceHist, cashflowHist);
    if (annual.length === 0) return null;

    const curr =
      (summary.price as unknown as { financialCurrency?: string })
        ?.financialCurrency ||
      summary.price?.currency ||
      "USD";

    return {
      annual: annual.slice(0, 5),
      currency: curr,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Short-Interest
// ============================================================

export interface ShortInterestInfo {
  ticker: string;
  sharesShort?: number;
  sharesShortPriorMonth?: number;
  shortPercentOfFloat?: number;
  shortRatio?: number;
  dateShortInterest?: string;
  priorMonthDate?: string;
  shortPercentChange?: number;
}

export async function getShortInterest(
  ticker: string
): Promise<ShortInterestInfo | null> {
  try {
    const s = await yahooFinance.quoteSummary(ticker, {
      modules: ["defaultKeyStatistics"],
    });
    const k = s.defaultKeyStatistics as unknown as {
      sharesShort?: number;
      sharesShortPriorMonth?: number;
      shortRatio?: number;
      shortPercentOfFloat?: number;
      dateShortInterest?: Date | number;
      sharesShortPreviousMonthDate?: Date | number;
    } | undefined;
    if (!k) return null;
    const sharesShort = k.sharesShort;
    const sharesShortPriorMonth = k.sharesShortPriorMonth;
    let shortPercentChange: number | undefined;
    if (
      typeof sharesShort === "number" &&
      typeof sharesShortPriorMonth === "number" &&
      sharesShortPriorMonth > 0
    ) {
      shortPercentChange =
        ((sharesShort - sharesShortPriorMonth) / sharesShortPriorMonth) * 100;
    }
    if (sharesShort == null && k.shortRatio == null && k.shortPercentOfFloat == null) {
      return null;
    }
    const toIso = (v: Date | number | undefined): string | undefined => {
      if (v == null) return undefined;
      const d = typeof v === "number" ? new Date(v * (v < 1e12 ? 1000 : 1)) : v;
      return d.toISOString().slice(0, 10);
    };
    return {
      ticker: ticker.toUpperCase(),
      sharesShort,
      sharesShortPriorMonth,
      shortPercentOfFloat: k.shortPercentOfFloat,
      shortRatio: k.shortRatio,
      dateShortInterest: toIso(k.dateShortInterest),
      priorMonthDate: toIso(k.sharesShortPreviousMonthDate),
      shortPercentChange,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Analysten-EPS-Revisions
// ============================================================

export interface EpsRevisionItem {
  period: string; // z.B. "0q", "+1q", "0y", "+1y"
  label: string;
  currentEstimate?: number;
  estimateCount?: number;
  up7d?: number;
  down7d?: number;
  up30d?: number;
  down30d?: number;
  growth?: number;
}

const PERIOD_LABELS: Record<string, string> = {
  "0q": "akt. Quartal",
  "+1q": "nächstes Quartal",
  "0y": "akt. Jahr",
  "+1y": "nächstes Jahr",
  "-1q": "voriges Quartal",
  "+5y": "nächste 5 Jahre (p.a.)",
  "-5y": "letzte 5 Jahre (p.a.)",
};

// ============================================================
// Analyst-Rating-History (Upgrades/Downgrades über Zeit)
// ============================================================

export interface AnalystRatingChange {
  date: string;
  firm: string;
  toGrade?: string;
  fromGrade?: string;
  action?: string;
}

export async function getUpgradeDowngradeHistory(
  ticker: string
): Promise<AnalystRatingChange[]> {
  try {
    const s = await yahooFinance.quoteSummary(ticker, {
      modules: ["upgradeDowngradeHistory"],
    });
    const list = s.upgradeDowngradeHistory?.history || [];
    return list.slice(0, 40).map((h) => ({
      date: h.epochGradeDate
        ? new Date(h.epochGradeDate).toISOString().slice(0, 10)
        : "",
      firm: String(h.firm || ""),
      toGrade: h.toGrade ? String(h.toGrade) : undefined,
      fromGrade: h.fromGrade ? String(h.fromGrade) : undefined,
      action: h.action ? String(h.action) : undefined,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Institutional & Fund-Ownership (13F)
// ============================================================

export interface InstitutionalHolder {
  organization: string;
  pctHeld?: number;
  position?: number;
  value?: number;
  reportDate?: string;
}

export interface OwnershipInfo {
  institutionalHolders: InstitutionalHolder[];
  fundHolders: InstitutionalHolder[];
  /** Gesamtanteil institutioneller Investoren am Float */
  institutionalPercentHeld?: number;
  insiderPercentHeld?: number;
}

export async function getOwnershipInfo(
  ticker: string
): Promise<OwnershipInfo | null> {
  try {
    const s = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "institutionOwnership",
        "fundOwnership",
        "majorHoldersBreakdown",
      ],
    });
    const mapHolder = (
      h: {
        organization?: string;
        pctHeld?: number;
        position?: number;
        value?: number;
        reportDate?: Date | string;
      }
    ): InstitutionalHolder => ({
      organization: String(h.organization || ""),
      pctHeld: h.pctHeld,
      position: h.position,
      value: h.value,
      reportDate: h.reportDate
        ? new Date(h.reportDate).toISOString().slice(0, 10)
        : undefined,
    });
    const inst = s.institutionOwnership?.ownershipList || [];
    const funds = s.fundOwnership?.ownershipList || [];
    const breakdown = s.majorHoldersBreakdown;
    return {
      institutionalHolders: inst.slice(0, 15).map(mapHolder),
      fundHolders: funds.slice(0, 15).map(mapHolder),
      institutionalPercentHeld: breakdown?.institutionsPercentHeld,
      insiderPercentHeld: breakdown?.insidersPercentHeld,
    };
  } catch {
    return null;
  }
}

export async function getEpsRevisions(
  ticker: string
): Promise<EpsRevisionItem[]> {
  try {
    const s = await yahooFinance.quoteSummary(ticker, {
      modules: ["earningsTrend"],
    });
    const trend = s.earningsTrend?.trend || [];
    const numOrU = (v: number | null | undefined | unknown): number | undefined =>
      typeof v === "number" ? v : undefined;
    return trend.map((t) => ({
      period: t.period || "",
      label: PERIOD_LABELS[t.period || ""] || t.period || "",
      currentEstimate: numOrU(t.earningsEstimate?.avg),
      estimateCount: numOrU(t.earningsEstimate?.numberOfAnalysts),
      up7d: numOrU(t.epsRevisions?.upLast7days),
      down7d: numOrU(t.epsRevisions?.downLast7days),
      up30d: numOrU(t.epsRevisions?.upLast30days),
      down30d: numOrU(t.epsRevisions?.downLast30days),
      growth: numOrU(t.earningsEstimate?.growth),
    }));
  } catch {
    return [];
  }
}
