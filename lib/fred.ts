/**
 * FRED-Integration (Federal Reserve Bank of St. Louis).
 * https://fred.stlouisfed.org/docs/api/fred/
 *
 * Free, mit API-Key. Kein hartes Limit für unseren Use-Case (persönliches
 * Tool); öffentliche Faustregel ist 120 calls/min, was wir nie ausreizen.
 *
 * Wir liefern hier ein kuratiertes Set globaler Makro-Indikatoren, das in
 * den `/macro-scenario`- und Briefing-Prompts an die KI gehen kann.
 */

import { getAppSettings } from "./models/AppSettings";
import { decryptSecret } from "./secretCrypto";

const FRED_BASE = "https://api.stlouisfed.org/fred";

interface FredObservationRaw {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
}
interface FredObservationsResponse {
  observations: FredObservationRaw[];
}

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredSeriesSnapshot {
  seriesId: string;
  label: string;
  unit: string;
  /** Kurzer (1-Satz) Hinweis, wofür der Indikator steht. */
  hint: string;
  latest?: FredObservation;
  previous?: FredObservation;
  /** Differenz `latest - previous`. Für Yields/Spreads in Basispunkten lesbar. */
  delta?: number;
  /** Veränderung in % gegenüber `previous`. */
  deltaPct?: number;
  /** Veränderung gegenüber Wert vor 12 Monaten — nur wenn vorhanden. */
  yoyPct?: number;
}

export interface MacroSnapshot {
  /** Wann das Bundle erstellt wurde (Cache-Stempel). */
  asOf: number;
  series: FredSeriesSnapshot[];
}

/**
 * Standard-Indikatoren-Bundle. Mehr Series-IDs sind frei einzeln abrufbar
 * via `getFredSeries()`, aber dieses Set deckt 90 % aller Macro-Szenarien
 * ab und bleibt prompt-freundlich kompakt.
 */
export const MACRO_SERIES: Array<{
  id: string;
  label: string;
  unit: string;
  hint: string;
}> = [
  { id: "DGS10", label: "US 10Y Treasury", unit: "%", hint: "Long-Term-Risikofreier Zins, Diskontfaktor für Aktienbewertung." },
  { id: "DGS2", label: "US 2Y Treasury", unit: "%", hint: "Short-Term-Zins, reagiert stärker auf Fed-Erwartungen." },
  { id: "T10Y2Y", label: "10Y-2Y Spread", unit: "%", hint: "Yield-Curve-Spread; negativer Wert klassischer Rezessions-Indikator." },
  { id: "FEDFUNDS", label: "Fed Funds Rate", unit: "%", hint: "Effektiver Leitzins der US-Federal-Reserve, monatlich." },
  { id: "ECBDFR", label: "ECB Deposit Rate", unit: "%", hint: "EZB-Einlagensatz — der EUR-Zins für Banken-Übernacht-Einlagen." },
  { id: "CPIAUCSL", label: "US CPI YoY", unit: "%", hint: "Verbraucherpreis-Index gesamt, Jahresveränderung in %." },
  { id: "UNRATE", label: "US Unemployment", unit: "%", hint: "US-Arbeitslosenquote, monatlich." },
  { id: "VIXCLS", label: "VIX", unit: "", hint: "Implizite 30-Tage-Volatilität S&P 500. >25 = nervöser Markt." },
  { id: "DEXUSEU", label: "USD/EUR Rate", unit: "USD per EUR", hint: "Fester Mittagskurs, NY-Fed." },
  { id: "DCOILWTICO", label: "WTI Crude Oil", unit: "USD/barrel", hint: "Spot-Preis WTI-Rohöl, Treiber von Energie-/Inflation." },
];

interface CacheEntry {
  at: number;
  data: FredObservation[];
}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const cache = new Map<string, CacheEntry>();

async function getFredApiKey(): Promise<string | null> {
  try {
    const settings = await getAppSettings();
    const raw = settings.dataSources?.fredApiKey;
    if (!raw) return null;
    return decryptSecret(raw) || null;
  } catch {
    return null;
  }
}

export async function isFredConfigured(): Promise<boolean> {
  const key = await getFredApiKey();
  return Boolean(key);
}

function parseObservations(raw: FredObservationsResponse): FredObservation[] {
  if (!raw?.observations) return [];
  return raw.observations
    .filter((o) => o.value !== "." && o.value !== "" && Number.isFinite(parseFloat(o.value)))
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

/**
 * Holt die letzten `limit` Observations einer Series. Default: 13 Monate, sodass
 * sowohl letzter Wert als auch YoY-Vergleich abrufbar sind.
 */
export async function getFredSeries(
  seriesId: string,
  limit = 14
): Promise<FredObservation[]> {
  const key = await getFredApiKey();
  if (!key) return [];

  const cached = cache.get(seriesId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    const url =
      `${FRED_BASE}/series/observations?series_id=${encodeURIComponent(seriesId)}` +
      `&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        console.warn(`[fred] series ${seriesId} not found / bad request`);
      } else if (res.status === 429) {
        console.warn(`[fred] rate-limited`);
      } else if (res.status === 401 || res.status === 403) {
        console.warn(`[fred] auth failed (${res.status}) — Key prüfen`);
      }
      return [];
    }
    const json = (await res.json()) as FredObservationsResponse;
    // FRED liefert sort_order=desc → newest first. Wir kehren zu chronologisch um.
    const data = parseObservations(json).reverse();
    cache.set(seriesId, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.warn(`[fred] fetch error ${seriesId}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

function findYoY(obs: FredObservation[]): FredObservation | undefined {
  if (obs.length === 0) return undefined;
  const latest = obs[obs.length - 1];
  // Such einen Datenpunkt rund 12 Monate älter (±15 Tage Toleranz).
  const targetMs = new Date(latest.date).getTime() - 365 * 24 * 3600 * 1000;
  let best: FredObservation | undefined;
  let bestDiff = Infinity;
  for (const o of obs) {
    const diff = Math.abs(new Date(o.date).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }
  if (best && bestDiff <= 16 * 24 * 3600 * 1000) return best;
  return undefined;
}

/**
 * Liefert ein Snapshot-Bundle aller `MACRO_SERIES`. Reihen, für die kein FRED-Key
 * konfiguriert ist oder die fehlschlagen, werden ohne `latest` zurückgegeben —
 * der Caller kann sie dann ausblenden bzw. ohne Wert in den Prompt geben.
 */
export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  const series = await Promise.all(
    MACRO_SERIES.map(async (def): Promise<FredSeriesSnapshot> => {
      const obs = await getFredSeries(def.id, 14);
      if (obs.length === 0) {
        return { seriesId: def.id, label: def.label, unit: def.unit, hint: def.hint };
      }
      const latest = obs[obs.length - 1];
      const previous = obs.length > 1 ? obs[obs.length - 2] : undefined;
      const yoy = findYoY(obs);
      const delta = previous ? latest.value - previous.value : undefined;
      const deltaPct =
        previous && previous.value !== 0
          ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
          : undefined;
      const yoyPct =
        yoy && yoy.value !== 0
          ? ((latest.value - yoy.value) / Math.abs(yoy.value)) * 100
          : undefined;
      // Spezialfall CPI: FRED liefert Index-Wert, nicht YoY. Für sinnvolle
      // Lesbarkeit überschreiben wir `value`/`previous` mit der YoY-Inflation,
      // die der User intuitiv erwartet.
      if (def.id === "CPIAUCSL" && yoyPct != null) {
        return {
          seriesId: def.id,
          label: def.label,
          unit: def.unit,
          hint: def.hint,
          latest: { date: latest.date, value: yoyPct },
          previous: previous && yoy
            ? {
                date: previous.date,
                value: ((previous.value - yoy.value) / Math.abs(yoy.value)) * 100,
              }
            : undefined,
          delta: undefined,
          deltaPct: undefined,
          yoyPct,
        };
      }
      return {
        seriesId: def.id,
        label: def.label,
        unit: def.unit,
        hint: def.hint,
        latest,
        previous,
        delta,
        deltaPct,
        yoyPct,
      };
    })
  );
  return { asOf: Date.now(), series };
}

/**
 * Formatiert ein Macro-Snapshot als kompakter Prompt-Block für die KI.
 */
export function formatMacroForPrompt(snap: MacroSnapshot): string {
  const lines: string[] = ["=== MAKRO-INDIKATOREN (FRED, aktuell) ==="];
  for (const s of snap.series) {
    if (!s.latest) continue;
    const val = s.latest.value;
    const valStr = `${val.toFixed(2)}${s.unit ? " " + s.unit : ""}`;
    const trend =
      s.delta != null
        ? ` (Δ vs. Vorperiode ${s.delta >= 0 ? "+" : ""}${s.delta.toFixed(2)})`
        : "";
    lines.push(`${s.label} (${s.seriesId}): ${valStr}${trend} — ${s.hint}`);
  }
  return lines.join("\n");
}
