/**
 * Google-Trends-Integration.
 *
 * Google bietet keine offizielle Public-API; wir nutzen das etablierte
 * `google-trends-api`-npm-Package, das die internen Trends-Endpoints
 * anspricht. Kein API-Key — Google ratelimited per IP, was für ein
 * persönliches Tool praktisch nie greift.
 *
 * Liefert zwei Signale:
 *  - **Interest-Over-Time**: relative Search-Volumen-Werte (0–100, normiert
 *    auf das Maximum im Beobachtungsfenster). Eignet sich als
 *    Sentiment-/Aufmerksamkeits-Proxy parallel zu Wikipedia-Pageviews.
 *  - **Related Queries (Rising)**: Suchanfragen, deren Volumen aktuell
 *    durch die Decke geht. Oft ein früher Catalyst-Indikator
 *    (z. B. „aapl earnings", „nvidia split", „xyz lawsuit").
 */

// google-trends-api hat keine TypeScript-Typings. Da es kein @types-Package
// gibt, deklarieren wir das benötigte Interface inline. Funktionen geben
// JSON-Strings zurück, die wir parsen müssen.
interface GoogleTrendsApi {
  interestOverTime(options: {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
  }): Promise<string>;
  relatedQueries(options: {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
  }): Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api") as GoogleTrendsApi;

interface TimelineDataRaw {
  time: string;
  formattedAxisTime?: string;
  value: number[];
  formattedValue?: string[];
  hasData?: boolean[];
}

interface InterestOverTimeRaw {
  default?: {
    timelineData?: TimelineDataRaw[];
  };
}

interface RankedKeywordRaw {
  query: string;
  value: number;
  formattedValue?: string;
  link?: string;
}

interface RelatedQueriesRaw {
  default?: {
    rankedList?: Array<{
      rankedKeyword?: RankedKeywordRaw[];
    }>;
  };
}

export interface TrendsTimeline {
  date: string;
  value: number;
}

export interface RisingRelatedQuery {
  query: string;
  /** Google liefert -1 für „Breakout" (>5000 % Anstieg), sonst Prozent. */
  value: number;
  formatted: string;
}

export interface GoogleTrendsSnapshot {
  keyword: string;
  geo: string;
  timeline: TrendsTimeline[];
  /** Mittelwert der letzten 7 Tage. */
  recentAvg7d: number;
  /** Mittelwert der ~30 davor liegenden Tage. */
  baselineAvg30d: number;
  /** recentAvg7d / baselineAvg30d. >1.5 = aktuell deutlich höhere Aufmerksamkeit. */
  spikeRatio: number;
  /** Top-3 stark steigende verwandte Suchen (Rising). */
  rising: RisingRelatedQuery[];
}

interface CacheEntry {
  at: number;
  data: GoogleTrendsSnapshot | null;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Bereinigt den Yahoo-Quote-Namen für Google Trends. Anders als bei
 * Wikipedia stört „Inc" / „Corp" hier nicht zwingend, aber wir entfernen
 * sie trotzdem — Trends matched besser auf den Marken-Kern.
 */
export function guessTrendsKeyword(name: string): string {
  let cleaned = name
    .replace(/\b(Inc\.?|Corp\.?|Corporation|Ltd\.?|S\.A\.|N\.V\.|AG|SE|plc|Holdings?|Co\.?)\b/gi, "")
    .replace(/[,&]/g, "")
    .trim();
  cleaned = cleaned.split(/\s+/).slice(0, 3).join(" ");
  return cleaned.trim() || name.trim();
}

function safeParse<T>(raw: string): T | null {
  if (typeof raw !== "string") return null;
  // Wenn Google blockiert, kommt manchmal HTML zurück (kein JSON).
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

async function fetchInterest(
  keyword: string,
  geo: string,
  startTime: Date
): Promise<TrendsTimeline[]> {
  try {
    const raw = await googleTrends.interestOverTime({ keyword, startTime, geo });
    const parsed = safeParse<InterestOverTimeRaw>(raw);
    const timeline = parsed?.default?.timelineData || [];
    return timeline
      .map((t): TrendsTimeline | null => {
        const v = Array.isArray(t.value) && t.value.length > 0 ? t.value[0] : null;
        if (v == null || !Number.isFinite(v)) return null;
        const tsSec = parseInt(t.time, 10);
        if (!Number.isFinite(tsSec)) return null;
        const d = new Date(tsSec * 1000);
        return { date: d.toISOString().slice(0, 10), value: v };
      })
      .filter((x): x is TrendsTimeline => x != null);
  } catch (e) {
    console.warn(
      `[google-trends] interest fetch error ${keyword}:`,
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

async function fetchRising(
  keyword: string,
  geo: string,
  startTime: Date
): Promise<RisingRelatedQuery[]> {
  try {
    const raw = await googleTrends.relatedQueries({ keyword, startTime, geo });
    const parsed = safeParse<RelatedQueriesRaw>(raw);
    const rankedLists = parsed?.default?.rankedList || [];
    // rankedList[0] = Top, rankedList[1] = Rising.
    const rising = rankedLists.length > 1 ? rankedLists[1].rankedKeyword || [] : [];
    return rising.slice(0, 3).map((r) => ({
      query: r.query,
      value: r.value,
      formatted: r.formattedValue || (r.value === -1 ? "Breakout" : `+${r.value}%`),
    }));
  } catch (e) {
    console.warn(
      `[google-trends] related fetch error ${keyword}:`,
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

/**
 * Holt einen kompletten Trends-Snapshot für ein Keyword. Default: ~90 Tage,
 * weltweite Suche. `geo` kann auf `"US"`, `"DE"` etc. eingegrenzt werden.
 */
export async function getGoogleTrendsSnapshot(
  keyword: string,
  options: { geo?: string; days?: number } = {}
): Promise<GoogleTrendsSnapshot | null> {
  const kw = keyword.trim();
  if (!kw) return null;
  const geo = options.geo ?? "";
  const days = options.days ?? 90;
  const cacheKey = `${kw.toLowerCase()}::${geo}::${days}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);

  const [timeline, rising] = await Promise.all([
    fetchInterest(kw, geo, startTime),
    fetchRising(kw, geo, startTime),
  ]);

  if (timeline.length < 7) {
    // Zu wenige Datenpunkte — keine sinnvolle Spike-Berechnung.
    cache.set(cacheKey, { at: Date.now(), data: null });
    return null;
  }

  // Trends liefert bei 90-Tage-Range typischerweise tägliche Werte. Wenn
  // wöchentlich, sind die Slice-Größen entsprechend kleiner — die Logik
  // bleibt aber gleich (recent vs. baseline).
  const last7 = timeline.slice(-7);
  const baseline = timeline.slice(-37, -7);
  const recentAvg7d = last7.reduce((s, x) => s + x.value, 0) / last7.length;
  const baselineAvg30d =
    baseline.length > 0
      ? baseline.reduce((s, x) => s + x.value, 0) / baseline.length
      : recentAvg7d;
  const spikeRatio = baselineAvg30d > 0 ? recentAvg7d / baselineAvg30d : 1;

  const snap: GoogleTrendsSnapshot = {
    keyword: kw,
    geo: geo || "Worldwide",
    timeline,
    recentAvg7d,
    baselineAvg30d,
    spikeRatio,
    rising,
  };
  cache.set(cacheKey, { at: Date.now(), data: snap });
  return snap;
}

/**
 * Kompakter Prompt-Block, parallel zu Wikipedia. Gibt leeren String zurück
 * wenn keine Daten verfügbar sind — der Caller filtert ihn dann raus.
 */
export function formatTrendsForPrompt(snap: GoogleTrendsSnapshot | null): string {
  if (!snap) return "";
  const ratio = snap.spikeRatio;
  let level: string;
  if (ratio >= 2) level = "starker Suchinteresse-Spike";
  else if (ratio >= 1.4) level = "leicht erhöhtes Suchinteresse";
  else if (ratio <= 0.7) level = "ungewöhnlich wenig Suchinteresse";
  else level = "normales Niveau";

  const lines: string[] = [
    "=== GOOGLE-TRENDS (Suchinteresse) ===",
    `Keyword: „${snap.keyword}" (${snap.geo})`,
    `7T Ø: ${snap.recentAvg7d.toFixed(1)}/100`,
    `30T Baseline: ${snap.baselineAvg30d.toFixed(1)}/100`,
    `Spike-Ratio: ${ratio.toFixed(2)}x — ${level}`,
  ];
  if (snap.rising.length > 0) {
    lines.push(
      "Aktuell stark steigende verwandte Suchen: " +
        snap.rising.map((r) => `„${r.query}" (${r.formatted})`).join(", ")
    );
  }
  return lines.join("\n");
}
