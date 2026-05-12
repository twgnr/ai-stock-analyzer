/**
 * SEC EDGAR-Integration. https://www.sec.gov/edgar/sec-api-documentation
 *
 * EDGAR ist komplett kostenlos und ohne API-Key. SEC verlangt allerdings einen
 * identifizierenden User-Agent — sonst antworten Requests mit 403. Den
 * konfiguriert der Admin in den App-Settings.
 *
 * Wir bieten zwei Datenflüsse:
 *  1. Ticker → CIK-Mapping (via offizielles `company_tickers.json`).
 *  2. Letzte Filings eines Issuers (Form 10-K, 10-Q, 8-K, 4 = Insider).
 */

import { getAppSettings } from "./models/AppSettings";

const EDGAR_BASE = "https://data.sec.gov";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

interface TickerRecord {
  cik_str: number;
  ticker: string;
  title: string;
}

interface TickerResponse {
  [index: string]: TickerRecord;
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  tickers?: string[];
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export interface SecFiling {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  /** Direkter Link auf die Filing-Detailseite. */
  url: string;
}

let tickerMap: Map<string, { cik: string; name: string }> | null = null;
let tickerMapAt = 0;
const TICKER_TTL_MS = 24 * 60 * 60 * 1000;

async function getUserAgent(): Promise<string | null> {
  try {
    const settings = await getAppSettings();
    const ua = settings.dataSources?.secUserAgent?.trim();
    if (!ua) return null;
    return ua;
  } catch {
    return null;
  }
}

export async function isSecConfigured(): Promise<boolean> {
  return Boolean(await getUserAgent());
}

async function secFetch(url: string): Promise<Response | null> {
  const ua = await getUserAgent();
  if (!ua) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 403) {
        console.warn("[sec] 403 — User-Agent abgelehnt, Format prüfen (E-Mail enthalten?)");
      } else {
        console.warn(`[sec] fetch ${url} → ${res.status}`);
      }
      return null;
    }
    return res;
  } catch (e) {
    console.warn(`[sec] fetch error ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function loadTickerMap(): Promise<Map<string, { cik: string; name: string }>> {
  if (tickerMap && Date.now() - tickerMapAt < TICKER_TTL_MS) return tickerMap;
  const res = await secFetch(TICKERS_URL);
  if (!res) {
    if (!tickerMap) tickerMap = new Map();
    return tickerMap;
  }
  const json = (await res.json()) as TickerResponse;
  const map = new Map<string, { cik: string; name: string }>();
  for (const key of Object.keys(json)) {
    const r = json[key];
    if (!r) continue;
    const padded = String(r.cik_str).padStart(10, "0");
    map.set(r.ticker.toUpperCase(), { cik: padded, name: r.title });
  }
  tickerMap = map;
  tickerMapAt = Date.now();
  return map;
}

/**
 * Versucht einen Ticker zu CIK aufzulösen. Funktioniert nur für US-Listings;
 * für Tickers mit Suffix `.DE`/`.L`/etc. liefert SEC keinen Treffer (das sind
 * keine SEC-Registranten). Da geben wir `null` zurück.
 */
export async function resolveCikFromTicker(
  ticker: string
): Promise<{ cik: string; name: string } | null> {
  const tk = ticker.toUpperCase();
  if (tk.includes(".") || tk.includes(":")) return null; // non-US
  const map = await loadTickerMap();
  return map.get(tk) ?? null;
}

interface CacheEntry {
  at: number;
  data: SecFiling[];
}
const filingsCache = new Map<string, CacheEntry>();
const FILINGS_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Holt die letzten Filings eines Issuers (CIK). `forms` filtert auf eine
 * Auswahl wie `["10-K", "10-Q", "8-K", "4"]`. Default sind die wichtigsten
 * Periodischen + Insider-Filings.
 */
export async function getRecentFilings(
  cik: string,
  options: { forms?: string[]; limit?: number } = {}
): Promise<SecFiling[]> {
  const forms = options.forms ?? ["10-K", "10-Q", "8-K", "4"];
  const limit = options.limit ?? 10;
  const cacheKey = `${cik}:${forms.join(",")}:${limit}`;
  const hit = filingsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < FILINGS_TTL_MS) return hit.data;

  const res = await secFetch(`${EDGAR_BASE}/submissions/CIK${cik}.json`);
  if (!res) return [];
  const json = (await res.json()) as SubmissionsResponse;
  const recent = json.filings?.recent;
  if (!recent) return [];

  const out: SecFiling[] = [];
  const formSet = new Set(forms);
  for (let i = 0; i < recent.form.length && out.length < limit; i++) {
    const form = recent.form[i];
    if (!formSet.has(form)) continue;
    const accession = recent.accessionNumber[i];
    const accNoDashes = accession.replace(/-/g, "");
    const primaryDoc = recent.primaryDocument[i];
    out.push({
      form,
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      accessionNumber: accession,
      primaryDocument: primaryDoc,
      primaryDocDescription: recent.primaryDocDescription[i] || "",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(
        form
      )}&dateb=&owner=include&count=10` ||
        `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNoDashes}/${primaryDoc}`,
    });
  }
  filingsCache.set(cacheKey, { at: Date.now(), data: out });
  return out;
}

/**
 * Convenience: holt zuletzt eingereichte Filings direkt per Ticker.
 * Wenn Ticker kein US-Listing ist (z. B. SAP.DE), liefert `null`.
 */
export async function getRecentFilingsByTicker(
  ticker: string,
  options: { forms?: string[]; limit?: number } = {}
): Promise<{ cik: string; name: string; filings: SecFiling[] } | null> {
  const resolved = await resolveCikFromTicker(ticker);
  if (!resolved) return null;
  const filings = await getRecentFilings(resolved.cik, options);
  return { cik: resolved.cik, name: resolved.name, filings };
}

/**
 * Formatiert die letzten Filings als prompt-freundlichen Block.
 */
export function formatFilingsForPrompt(filings: SecFiling[]): string {
  if (filings.length === 0) return "";
  const lines: string[] = ["=== SEC-FILINGS (letzte) ==="];
  for (const f of filings.slice(0, 8)) {
    const desc = f.primaryDocDescription ? ` — ${f.primaryDocDescription}` : "";
    lines.push(`[${f.filingDate}] ${f.form}${desc}`);
  }
  return lines.join("\n");
}
