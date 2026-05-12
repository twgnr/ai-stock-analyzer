/**
 * Erzeugt einen Themen-Basket: KI liefert Ticker-Vorschläge zum Thema, wir
 * validieren über Yahoo (Existenz + Marktkap), normalisieren auf USD und
 * sortieren in Big-/Mid-/Small-Cap-Buckets ein.
 *
 * Halluzinationen werden post-hoc rausgefiltert — was Yahoo nicht kennt oder
 * keine Marktkapitalisierung liefert, fliegt raus. Das schützt das Frontend
 * vor toten Tickern, ohne dass die KI das selbst korrekt klassifizieren muss.
 */

import { getAIClient } from "./ai/factory";
import { resolveAIConfig } from "./ai/factory";
import type { AIToolSchema } from "./ai/types";
import type { SessionUser } from "./auth";
import { UserFacingError } from "./apiError";
import { logClaudeUsage } from "./claudeUsage";
import { estimateCostUSD } from "./aiPricing";
import { getQuotesBatch } from "./yahoo";
import { getRates } from "./fx";
import type { ThemeBucket, IThemeTicker } from "./models/ThemeBasket";

/** USD-Schwellen für Marktkap-Buckets. */
const BIG_CAP_USD = 50_000_000_000; // > 50 Mrd. = Big
const MID_CAP_USD = 5_000_000_000; //  5–50 Mrd. = Mid; darunter Small/Mini

/** Anzahl pro Bucket im finalen Basket. */
const BUCKET_TARGET = 10;

/** Anzahl Vorschläge, die wir die KI generieren lassen — bewusst mehr als
 *  3×10, damit Yahoo-Reject und Bucket-Imbalancen abfedert werden. */
const KI_CANDIDATE_TARGET = 45;

const SYSTEM_PROMPT = `Du bist ein Aktien-Researcher.

Aufgabe: Zum vorgegebenen Investment-Thema lieferst du eine breite Auswahl börsennotierter Aktien (KEINE ETFs, KEINE Krypto, KEINE OTC-Penny-Stocks).

REGELN:
- Verwende AUSSCHLIESSLICH echte Yahoo-Finance-Symbole (z. B. "AAPL", "SAP.DE", "ASML", "RHM.DE", "0700.HK").
- Streue über Marktkapitalisierung: ungefähr 1/3 großer Konzerne (>50 Mrd. USD), 1/3 mittlere (5–50 Mrd. USD), 1/3 kleine (unter 5 Mrd. USD).
- Streue über Regionen, wenn das Thema nicht regional eingegrenzt ist (USA, Europa, Asien).
- Pro Aktie: 1 prägnanter deutscher Begründungs-Satz (max. 200 Zeichen), warum sie ins Thema passt.
- Liefere ${KI_CANDIDATE_TARGET} Aktien — keine Doubletten.
- Bei unsicheren Tickern lieber weglassen statt raten.`;

const TOOL_SCHEMA: AIToolSchema = {
  name: "submit_theme_basket",
  description: "Submit candidate stocks for the investment theme",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            name: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["ticker", "name", "rationale"],
        },
      },
    },
    required: ["candidates"],
  },
};

interface KICandidate {
  ticker: string;
  name: string;
  rationale: string;
}

export interface ThemeBasketResult {
  bigPlayers: IThemeTicker[];
  midPlayers: IThemeTicker[];
  smallPlayers: IThemeTicker[];
  generationModel: string;
  generationCostUsd: number;
  diagnostics: {
    kiCandidateCount: number;
    yahooMatched: number;
    droppedNoQuote: number;
    droppedNoMarketCap: number;
    droppedNoFx: number;
  };
}

function bucketFor(marketCapUsd: number): ThemeBucket {
  if (marketCapUsd >= BIG_CAP_USD) return "big";
  if (marketCapUsd >= MID_CAP_USD) return "mid";
  return "small";
}

export async function generateThemeBasket(
  themeName: string,
  themeDescription: string,
  user: SessionUser
): Promise<ThemeBasketResult> {
  const r = await resolveAIConfig(user, user._id);
  if (!r.ok) {
    const status =
      r.failure.reason === "daily-limit-exceeded" ||
      r.failure.reason === "monthly-limit-exceeded"
        ? 429
        : 503;
    throw new UserFacingError(r.failure.message, status);
  }
  const cfg = r.config;
  const client = getAIClient(cfg);

  const userPrompt = [
    `Thema: ${themeName}`,
    themeDescription ? `Beschreibung: ${themeDescription}` : "",
    "",
    `Liefere ${KI_CANDIDATE_TARGET} Aktien zu diesem Thema, mit einem Begründungs-Satz pro Aktie.`,
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await client.call({
    system: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 6000,
    tool: TOOL_SCHEMA,
  });

  // Usage loggen (nicht blockierend bei Fehlern).
  await logClaudeUsage({
    userId: user._id,
    operation: "theme-basket",
    model: aiResult.model,
    inputTokens: aiResult.inputTokens,
    outputTokens: aiResult.outputTokens,
    cacheCreationTokens: aiResult.cacheCreationTokens,
    cacheReadTokens: aiResult.cacheReadTokens,
    success: true,
  }).catch(() => {});

  const generationCostUsd = estimateCostUSD(
    aiResult.model,
    aiResult.inputTokens,
    aiResult.outputTokens,
    aiResult.cacheCreationTokens,
    aiResult.cacheReadTokens
  );

  const toolInput = aiResult.toolInput as { candidates?: KICandidate[] } | undefined;
  const rawCandidates = Array.isArray(toolInput?.candidates) ? toolInput.candidates : [];
  if (rawCandidates.length === 0) {
    throw new UserFacingError(
      "Die KI hat keine verwertbaren Aktien-Vorschläge geliefert. Bitte versuche ein anderes Thema oder formuliere konkreter.",
      502
    );
  }

  // Dedupe + Normalisierung der Tickers, KI-Reihenfolge erhalten
  const seen = new Set<string>();
  const candidates: KICandidate[] = [];
  for (const c of rawCandidates) {
    if (typeof c?.ticker !== "string" || typeof c?.name !== "string") continue;
    const t = c.ticker.toUpperCase().trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    candidates.push({
      ticker: t,
      name: String(c.name).trim().slice(0, 200),
      rationale: typeof c.rationale === "string" ? c.rationale.trim().slice(0, 280) : "",
    });
  }

  // Yahoo-Quotes batched holen — getQuotesBatch chunked intern bereits in 50ern.
  const tickers = candidates.map((c) => c.ticker);
  const quotes = await getQuotesBatch(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

  // Alle benötigten Währungen zu USD umrechnen — einmalig, nicht pro Ticker.
  const currencies = Array.from(
    new Set(quotes.map((q) => (q.currency || "USD").toUpperCase()))
  );
  const fxToUsd = await getRates(currencies, "USD");

  let droppedNoQuote = 0;
  let droppedNoMarketCap = 0;
  let droppedNoFx = 0;

  type EnrichedCandidate = IThemeTicker & {
    bucket: ThemeBucket;
    /** Original-Reihenfolge der KI — als Tiebreaker bei gleichem Marktkap. */
    kiIndex: number;
  };

  const enriched: EnrichedCandidate[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const q = quoteMap.get(c.ticker);
    if (!q) {
      droppedNoQuote++;
      continue;
    }
    if (typeof q.marketCap !== "number" || q.marketCap <= 0) {
      droppedNoMarketCap++;
      continue;
    }
    const cur = (q.currency || "USD").toUpperCase();
    const rate = cur === "USD" ? 1 : fxToUsd[cur];
    if (typeof rate !== "number" || !(rate > 0)) {
      droppedNoFx++;
      continue;
    }
    const marketCapUsd = q.marketCap * rate;
    enriched.push({
      ticker: c.ticker,
      name: q.name || c.name,
      marketCapUsd,
      currency: cur,
      rationale: c.rationale,
      bucket: bucketFor(marketCapUsd),
      kiIndex: i,
    });
  }

  // Pro Bucket: nach Marktkap absteigend, dann KI-Reihenfolge als Tiebreak.
  function sortBucket(arr: EnrichedCandidate[]): EnrichedCandidate[] {
    return [...arr].sort((a, b) => {
      if (b.marketCapUsd !== a.marketCapUsd) return b.marketCapUsd - a.marketCapUsd;
      return a.kiIndex - b.kiIndex;
    });
  }

  const stripMeta = (e: EnrichedCandidate): IThemeTicker => ({
    ticker: e.ticker,
    name: e.name,
    marketCapUsd: e.marketCapUsd,
    currency: e.currency,
    rationale: e.rationale,
  });

  const bigPlayers = sortBucket(enriched.filter((e) => e.bucket === "big"))
    .slice(0, BUCKET_TARGET)
    .map(stripMeta);
  const midPlayers = sortBucket(enriched.filter((e) => e.bucket === "mid"))
    .slice(0, BUCKET_TARGET)
    .map(stripMeta);
  const smallPlayers = sortBucket(enriched.filter((e) => e.bucket === "small"))
    .slice(0, BUCKET_TARGET)
    .map(stripMeta);

  if (
    bigPlayers.length === 0 &&
    midPlayers.length === 0 &&
    smallPlayers.length === 0
  ) {
    throw new UserFacingError(
      "Keine der KI-Vorschläge konnte über Yahoo verifiziert werden. Bitte Thema präziser formulieren oder erneut versuchen.",
      502
    );
  }

  return {
    bigPlayers,
    midPlayers,
    smallPlayers,
    generationModel: aiResult.model,
    generationCostUsd,
    diagnostics: {
      kiCandidateCount: candidates.length,
      yahooMatched: enriched.length,
      droppedNoQuote,
      droppedNoMarketCap,
      droppedNoFx,
    },
  };
}
