/**
 * Wikipedia Pageviews API. https://wikitech.wikimedia.org/wiki/Analytics/PageviewAPI
 *
 * Komplett kostenlos, kein API-Key. Pflicht-Feld: User-Agent (sonst 403),
 * den wir analog zu SEC dem `secUserAgent` aus den AppSettings entnehmen.
 *
 * Use-Case: tägliche Article-Page-Views der letzten ~60 Tage als
 * Aufmerksamkeits-Proxy. Spike-Detection liefert eine grobe Abschätzung
 * „heute ist mehr Aufmerksamkeit auf diese Aktie als sonst".
 */

import { getAppSettings } from "./models/AppSettings";

const PAGEVIEWS_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";

interface PageviewItem {
  project: string;
  article: string;
  granularity: string;
  timestamp: string;
  access: string;
  agent: string;
  views: number;
}
interface PageviewsResponse {
  items: PageviewItem[];
}

export interface PageviewSeries {
  article: string;
  /** Tägliche Page-Views, chronologisch ältester→neuester. */
  daily: Array<{ date: string; views: number }>;
  /** Mittelwert der letzten 7 Tage. */
  recentAvg7d: number;
  /** Mittelwert der letzten 30 Tage. */
  baselineAvg30d: number;
  /** Faktor recentAvg7d / baselineAvg30d. >1.5 = aktuelle Aufmerksamkeit höher als üblich. */
  spikeRatio: number;
  /** Maximalwert in den letzten 7 Tagen. */
  recentMax: number;
}

interface CacheEntry {
  at: number;
  data: PageviewSeries | null;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function getUserAgent(): Promise<string | null> {
  try {
    const settings = await getAppSettings();
    const ua = settings.dataSources?.secUserAgent?.trim();
    return ua || null;
  } catch {
    return null;
  }
}

function fmtDate(d: Date): string {
  // YYYYMMDD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Fragt für einen Wikipedia-Artikel die letzten 60 Tage an Pageviews ab und
 * berechnet einen einfachen Spike-Indikator.
 *
 * @param article Wikipedia-Article-Title — Spaces werden in Underscores umgewandelt.
 *                Beispiele: "Apple_Inc.", "NVIDIA", "Volkswagen_Group".
 */
export async function getArticlePageviews(
  article: string
): Promise<PageviewSeries | null> {
  const ua = await getUserAgent();
  if (!ua) return null;
  const articleNorm = article.trim().replace(/\s+/g, "_");
  if (!articleNorm) return null;

  const cacheKey = articleNorm.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 60);

  const url = `${PAGEVIEWS_BASE}/en.wikipedia/all-access/all-agents/${encodeURIComponent(
    articleNorm
  )}/daily/${fmtDate(start)}/${fmtDate(end)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      // 404 = Artikel existiert nicht — kein Fehler, einfach kein Datenpunkt.
      if (res.status !== 404) {
        console.warn(`[wikipedia] ${articleNorm} → ${res.status}`);
      }
      cache.set(cacheKey, { at: Date.now(), data: null });
      return null;
    }
    const json = (await res.json()) as PageviewsResponse;
    const daily = (json.items || []).map((it) => ({
      // timestamp ist YYYYMMDDHH (HH=00 für daily) — auf YYYY-MM-DD trimmen.
      date: `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`,
      views: it.views,
    }));
    if (daily.length === 0) {
      cache.set(cacheKey, { at: Date.now(), data: null });
      return null;
    }
    const last7 = daily.slice(-7);
    const last30 = daily.slice(-30);
    const recentAvg7d = last7.reduce((s, d) => s + d.views, 0) / Math.max(1, last7.length);
    const baselineAvg30d =
      last30.reduce((s, d) => s + d.views, 0) / Math.max(1, last30.length);
    const recentMax = Math.max(...last7.map((d) => d.views));
    const spikeRatio = baselineAvg30d > 0 ? recentAvg7d / baselineAvg30d : 1;

    const series: PageviewSeries = {
      article: articleNorm,
      daily,
      recentAvg7d,
      baselineAvg30d,
      spikeRatio,
      recentMax,
    };
    cache.set(cacheKey, { at: Date.now(), data: series });
    return series;
  } catch (e) {
    console.warn(
      `[wikipedia] fetch error ${articleNorm}:`,
      e instanceof Error ? e.message : e
    );
    cache.set(cacheKey, { at: Date.now(), data: null });
    return null;
  }
}

/**
 * Heuristisches Mapping Company-Name → Wikipedia-Article-Title. Kein perfekt,
 * aber für die meisten Large-Caps ausreichend. Bei Misses (404) returnt
 * `getArticlePageviews` einfach `null`.
 */
export function guessWikipediaArticle(name: string): string {
  // „Apple Inc." → „Apple_Inc."
  // „NVIDIA Corporation" → „Nvidia"
  let cleaned = name
    .replace(/\b(Inc\.?|Corp\.?|Corporation|Ltd\.?|S\.A\.|N\.V\.|AG|SE|plc|Holdings?)\b/gi, "")
    .replace(/[,&]/g, "")
    .trim();
  // Nur erste 4 Wörter behalten — viele Yahoo-Namen enthalten "Class A" etc.
  cleaned = cleaned.split(/\s+/).slice(0, 4).join(" ");
  return cleaned.replace(/\s+/g, "_");
}

export function formatPageviewsForPrompt(p: PageviewSeries | null): string {
  if (!p) return "";
  const ratio = p.spikeRatio;
  let level: string;
  if (ratio >= 2) level = "starker Aufmerksamkeits-Spike";
  else if (ratio >= 1.4) level = "leicht erhöhte Aufmerksamkeit";
  else if (ratio <= 0.7) level = "ungewöhnlich wenig Aufmerksamkeit";
  else level = "normales Niveau";
  return [
    "=== WIKIPEDIA-AUFMERKSAMKEIT ===",
    `Artikel: ${p.article}`,
    `Letzte 7T Ø: ${Math.round(p.recentAvg7d)} Views/Tag`,
    `30T Baseline: ${Math.round(p.baselineAvg30d)} Views/Tag`,
    `Spike-Ratio: ${ratio.toFixed(2)}x — ${level}`,
  ].join("\n");
}
