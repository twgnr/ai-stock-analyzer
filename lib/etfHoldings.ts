/**
 * ETF/Fund-Look-Through via Yahoo `quoteSummary`-Module.
 *
 * Yahoo liefert für ETFs/Mutual-Funds:
 *  - `topHoldings.holdings` → Array von { symbol, holdingName, holdingPercent }
 *  - `topHoldings.sectorWeightings` → Sektor-Aufteilung als Array von Maps
 *
 * Daten sind oft 1-2 Wochen alt und auf Top-10 begrenzt — für unseren
 * Look-Through-Use-Case („wo ist mein VWCE-Geld effektiv investiert?")
 * mehr als ausreichend. Echte 13F/NPORT-Holdings wären viel mehr Aufwand.
 */

import { yahooFinance } from "./yahoo";

interface YahooSectorWeighting {
  [sector: string]: number;
}

interface YahooTopHoldingsRaw {
  holdings?: Array<{
    symbol?: string;
    holdingName?: string;
    holdingPercent?: number;
  }>;
  sectorWeightings?: YahooSectorWeighting[];
  equityHoldings?: unknown;
  bondHoldings?: unknown;
}

interface YahooQuoteTypeRaw {
  quoteType?: string;
  symbol?: string;
}

export interface EtfHolding {
  ticker?: string;
  name: string;
  /** Anteil am ETF, in % (z. B. 7.2). */
  weight: number;
}

export interface EtfSectorWeight {
  sector: string;
  /** Anteil am ETF, in % (z. B. 24.3). */
  weight: number;
}

export interface EtfHoldingsSnapshot {
  ticker: string;
  /** Yahoo-quoteType: "ETF", "MUTUALFUND", … oder anderes (=> kein Look-Through). */
  quoteType: string;
  topHoldings: EtfHolding[];
  sectorWeights: EtfSectorWeight[];
}

interface CacheEntry {
  at: number;
  data: EtfHoldingsSnapshot | null;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — Holdings ändern sich langsam

const FUND_LIKE = new Set(["ETF", "MUTUALFUND", "FUND"]);

function normalizeSectorKey(key: string): string {
  // Yahoo verwendet camelCase wie "realestate", "consumer_cyclical" — auf
  // lesbare deutsche Labels mappen.
  const map: Record<string, string> = {
    realestate: "Immobilien",
    consumer_cyclical: "Zyklischer Konsum",
    basic_materials: "Grundstoffe",
    consumer_defensive: "Defensiver Konsum",
    technology: "Technologie",
    communication_services: "Kommunikation",
    financial_services: "Finanzen",
    industrials: "Industrie",
    energy: "Energie",
    healthcare: "Gesundheit",
    utilities: "Versorger",
  };
  const k = key.toLowerCase().replace(/-/g, "_");
  return map[k] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export async function getEtfHoldings(ticker: string): Promise<EtfHoldingsSnapshot | null> {
  const tk = ticker.toUpperCase();
  const cached = cache.get(tk);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    const summary = (await yahooFinance.quoteSummary(tk, {
      modules: ["topHoldings", "quoteType"],
    })) as { topHoldings?: YahooTopHoldingsRaw; quoteType?: YahooQuoteTypeRaw };

    const qt = (summary.quoteType?.quoteType || "").toUpperCase();
    if (!FUND_LIKE.has(qt)) {
      cache.set(tk, { at: Date.now(), data: null });
      return null;
    }

    const th = summary.topHoldings;
    const holdings: EtfHolding[] = [];
    if (th?.holdings && Array.isArray(th.holdings)) {
      for (const h of th.holdings) {
        if (h.holdingPercent == null || h.holdingPercent === 0) continue;
        holdings.push({
          ticker: h.symbol,
          name: h.holdingName || h.symbol || "?",
          // Yahoo liefert Anteile teilweise als Bruchzahl (0.072 = 7.2 %),
          // teilweise schon als Prozent. Heuristisch normalisieren.
          weight: h.holdingPercent <= 1 ? h.holdingPercent * 100 : h.holdingPercent,
        });
      }
    }

    const sectorWeights: EtfSectorWeight[] = [];
    if (th?.sectorWeightings && Array.isArray(th.sectorWeightings)) {
      for (const entry of th.sectorWeightings) {
        for (const [k, v] of Object.entries(entry)) {
          if (typeof v !== "number" || v === 0) continue;
          sectorWeights.push({
            sector: normalizeSectorKey(k),
            weight: v <= 1 ? v * 100 : v,
          });
        }
      }
    }

    const snapshot: EtfHoldingsSnapshot = {
      ticker: tk,
      quoteType: qt,
      topHoldings: holdings,
      sectorWeights: sectorWeights.sort((a, b) => b.weight - a.weight),
    };
    cache.set(tk, { at: Date.now(), data: snapshot });
    return snapshot;
  } catch (e) {
    console.warn(`[etf-holdings] ${ticker}:`, e instanceof Error ? e.message : e);
    cache.set(tk, { at: Date.now(), data: null });
    return null;
  }
}

/**
 * Aggregiert Look-Through-Exposure über mehrere Portfolio-Positionen.
 * `directWeights` ist ein Map von Ticker → Portfolio-Gewicht in %.
 *
 * Für jede ETF-Position wird `etf-Gewicht * Holding-Gewicht%` aufaddiert,
 * für direkte Aktien wird einfach das Direkt-Gewicht angerechnet.
 */
export async function computeLookThrough(
  directWeights: Record<string, number>
): Promise<{
  /** Effektive Aktien-Exposure pro Symbol (%). */
  effective: Record<string, { name: string; weight: number }>;
  /** Effektive Sektor-Exposure (%). */
  sectors: Record<string, number>;
  /** Welche Tickers wurden als ETF erkannt? */
  etfTickers: string[];
  /** Wie viel des Portfolios konnte nicht aufgelöst werden (kein ETF, oder ETF ohne Holdings)? */
  unresolvedPct: number;
}> {
  const effective: Record<string, { name: string; weight: number }> = {};
  const sectors: Record<string, number> = {};
  const etfTickers: string[] = [];
  let resolvedFromEtfs = 0;

  for (const [ticker, weight] of Object.entries(directWeights)) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const holdings = await getEtfHoldings(ticker);
    if (!holdings) {
      // Direkte Position
      const key = ticker.toUpperCase();
      effective[key] = {
        name: effective[key]?.name || ticker,
        weight: (effective[key]?.weight || 0) + weight,
      };
      continue;
    }
    etfTickers.push(ticker.toUpperCase());
    if (holdings.topHoldings.length === 0 && holdings.sectorWeights.length === 0) {
      // Als ETF erkannt aber keine Holdings → unresolved.
      continue;
    }
    resolvedFromEtfs += weight;
    for (const h of holdings.topHoldings) {
      const key = (h.ticker || h.name).toUpperCase();
      const contribution = (weight * h.weight) / 100;
      effective[key] = {
        name: h.name,
        weight: (effective[key]?.weight || 0) + contribution,
      };
    }
    for (const s of holdings.sectorWeights) {
      const contribution = (weight * s.weight) / 100;
      sectors[s.sector] = (sectors[s.sector] || 0) + contribution;
    }
  }

  // Direkte Aktien tragen keine eigene Sektor-Info bei (wir haben sie schon
  // in den effective-Holdings, aber Sektor-Mapping wäre eine weitere
  // Yahoo-Round-Trip — dafür gibt's andere Pfade in der Codebase). Nicht-aufgelöste
  // Direkt-Positionen bleiben unberücksichtigt im Sektor-Bucket.
  const totalEffective = Object.values(effective).reduce((s, x) => s + x.weight, 0);
  const totalDirect = Object.values(directWeights).reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const unresolvedPct = Math.max(0, totalDirect - totalEffective);

  return { effective, sectors, etfTickers, unresolvedPct };
}

/**
 * Format für Prompt.
 */
export function formatLookThroughForPrompt(
  result: Awaited<ReturnType<typeof computeLookThrough>>
): string {
  const lines: string[] = [];
  if (result.etfTickers.length === 0) return "";
  lines.push(`=== LOOK-THROUGH (ETFs aufgelöst: ${result.etfTickers.join(", ")}) ===`);

  const top = Object.entries(result.effective)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 12);
  if (top.length > 0) {
    lines.push("Top effektive Aktien-Exposures:");
    for (const [tk, info] of top) {
      lines.push(`  ${tk} (${info.name}): ${info.weight.toFixed(2)}%`);
    }
  }

  const sectorEntries = Object.entries(result.sectors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (sectorEntries.length > 0) {
    lines.push("Effektive Sektor-Exposures:");
    for (const [sec, w] of sectorEntries) {
      lines.push(`  ${sec}: ${w.toFixed(2)}%`);
    }
  }
  if (result.unresolvedPct > 0.5) {
    lines.push(
      `(${result.unresolvedPct.toFixed(1)}% des Portfolios in Fonds ohne abrufbare Holdings — fehlt im Look-Through.)`
    );
  }
  return lines.join("\n");
}
