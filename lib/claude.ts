import type { Types } from "mongoose";
import { logClaudeUsage } from "./claudeUsage";
import { getAIClient, buildAIConfig, hasAnyAIAccess, resolveAIConfig } from "./ai/factory";
import type { AIConfig, AIResult, AIStreamChunk, AIToolSchema } from "./ai/types";
import type { SessionUser } from "./auth";
import { UserFacingError } from "./apiError";

type UsageOwner = Types.ObjectId | string | undefined;

// Sprachen, in denen wir die System-/User-Prompts ausliefern. Sync mit
// i18n/routing.ts — wir tippen lokal, damit lib/claude.ts kein Next-Intl
// importieren muss (sonst hängt der KI-Layer am Request-Kontext).
export type PromptLocale = "de" | "en";

// Leitet die Prompt-Locale aus dem SessionUser ab. Fallback `de`, damit
// Bestands-User ohne explizite Locale-Präferenz weiterhin Deutsch bekommen.
function localeFor(user?: { locale?: string | null } | null): PromptLocale {
  return user?.locale === "en" ? "en" : "de";
}

// Standard-Direktive „Antworte ausschließlich in JSON" pro Locale. Wird in
// fast jedem System-Prompt referenziert.
function jsonOnlyDirective(locale: PromptLocale): string {
  return locale === "en"
    ? "Respond ONLY in JSON:"
    : "Antworte AUSSCHLIESSLICH in JSON:";
}

// „Antworte als JSON." am Ende des User-Prompts.
function jsonReplyDirective(locale: PromptLocale): string {
  return locale === "en" ? "Respond as JSON." : "Antworte als JSON.";
}

function jsonReplySchemaDirective(locale: PromptLocale): string {
  return locale === "en"
    ? "Respond as JSON matching the schema."
    : "Antworte als JSON gemäß Schema.";
}

// Sprach-Direktive für System-Prompts — der entscheidende Hebel: damit
// schaltet das Modell die Output-Sprache komplett um.
function alwaysRespondInLanguageDirective(locale: PromptLocale): string {
  return locale === "en"
    ? "Always respond in English"
    : "Antworte IMMER auf Deutsch";
}

async function logUsage(
  result: AIResult,
  userId: UsageOwner,
  operation: string
) {
  if (!userId) return;
  await logClaudeUsage({
    userId,
    operation,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cacheCreationTokens: result.cacheCreationTokens,
    cacheReadTokens: result.cacheReadTokens,
    success: true,
  });
}

export async function hasClaudeKey(user?: SessionUser | null): Promise<boolean> {
  if (!user) return false;
  return hasAnyAIAccess(user, user._id);
}

async function resolveConfig(
  user: SessionUser | null | undefined
): Promise<AIConfig> {
  if (!user) throw new UserFacingError("Nicht eingeloggt.", 401);
  const r = await resolveAIConfig(user, user._id);
  if (!r.ok) {
    // Limit-Überschreitungen als 429, andere Konfigurationsfehler als 503.
    const status =
      r.failure.reason === "daily-limit-exceeded" ||
      r.failure.reason === "monthly-limit-exceeded"
        ? 429
        : 503;
    throw new UserFacingError(r.failure.message, status);
  }
  return r.config;
}

function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("KI-Antwort enthielt kein JSON: " + trimmed.slice(0, 200));
  }
  let json = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(json) as T;
  } catch {
    json = json.replace(/,(\s*[\]}])/g, "$1");
    try {
      return JSON.parse(json) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "JSON parse error";
      throw new Error(`KI-JSON nicht parsebar (${msg}). Erste 300 Zeichen: ${json.slice(0, 300)}`);
    }
  }
}

// ============================================================
// Single AI Stock Analyzer
// ============================================================

export interface StockContext {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  changePercent: number;
  fundamentals?: Record<string, unknown> | null;
  news?: Array<{ title: string; publisher: string; publishedAt: string }>;
  redditPosts?: Array<{ title: string; subreddit: string; score: number; numComments: number }>;
  position?: { shares: number; avgPrice: number; unrealizedPct: number };
  /** Optional: vorgerenderte Zusatz-Quellen-Blöcke (Finnhub-Analytics, SEC,
   *  Wikipedia, …). Werden als zusätzliche Sektionen ans Prompt angehängt. */
  additionalSources?: string[];
}

export interface StockAnalysisResult {
  recommendation: "BUY" | "HOLD" | "SELL" | "REDUCE" | "ACCUMULATE";
  confidence: number;
  summary: string;
  reasoning: string;
  risks: string[];
  opportunities: string[];
  priceTargets?: { low?: number; base?: number; high?: number };
  suggestedAllocation?: string;
}

function stockSystemPrompt(locale: PromptLocale): string {
  if (locale === "en") {
    return `You are an experienced financial analyst. You analyze stocks based on the data you are given.

RULES:
- ${alwaysRespondInLanguageDirective(locale)}
- Recommendation: BUY, HOLD, SELL, REDUCE, ACCUMULATE
- Justify clearly using the data
- List risks and opportunities
- When fundamentals allow, give price-target ranges (low/base/high)
- With a position context: concretely recommend add/hold/reduce
- No filler

NOT INVESTMENT ADVICE.

${jsonOnlyDirective(locale)}
{
  "recommendation": "BUY|HOLD|SELL|REDUCE|ACCUMULATE",
  "confidence": 0.0-1.0,
  "summary": "1-2 sentences",
  "reasoning": "3-6 sentences",
  "risks": ["..."],
  "opportunities": ["..."],
  "priceTargets": { "low": 123, "base": 145, "high": 170 },
  "suggestedAllocation": "optional"
}`;
  }
  return `Du bist ein erfahrener Finanzanalyst. Du analysierst Aktien auf Basis der Daten, die dir vorgelegt werden.

REGELN:
- ${alwaysRespondInLanguageDirective(locale)}
- Empfehlung: BUY, HOLD, SELL, REDUCE, ACCUMULATE
- Begründe nachvollziehbar mit den Daten
- Liste Risiken und Chancen
- Wenn Fundamentals es hergeben, Kurszielspannen (low/base/high)
- Bei Positions-Kontext: konkret nachkaufen/halten/reduzieren
- Keine Floskeln

KEINE ANLAGEBERATUNG.

${jsonOnlyDirective(locale)}
{
  "recommendation": "BUY|HOLD|SELL|REDUCE|ACCUMULATE",
  "confidence": 0.0-1.0,
  "summary": "1-2 Sätze",
  "reasoning": "3-6 Sätze",
  "risks": ["..."],
  "opportunities": ["..."],
  "priceTargets": { "low": 123, "base": 145, "high": 170 },
  "suggestedAllocation": "optional"
}`;
}

export async function analyzeStock(
  ctx: StockContext,
  user: SessionUser,
  config?: AIConfig
): Promise<StockAnalysisResult> {
  const cfg = config ?? (await resolveConfig(user));
  const client = getAIClient(cfg);
  const locale = localeFor(user);
  const prompt = buildStockPrompt(ctx, locale);

  const result = await client.call({
    system: stockSystemPrompt(locale),
    userPrompt: prompt,
    maxTokens: 1500,
  });

  await logUsage(result, user._id, "single-ai-stock-analyzer");
  return parseJsonResponse<StockAnalysisResult>(result.text || "");
}

function buildStockPrompt(ctx: StockContext, locale: PromptLocale): string {
  const isEn = locale === "en";
  const lines: string[] = [
    isEn
      ? `Analyze the stock ${ctx.ticker} (${ctx.name}).`
      : `Analysiere die Aktie ${ctx.ticker} (${ctx.name}).`,
    "",
    isEn ? "=== PRICE DATA ===" : "=== KURSDATEN ===",
    isEn
      ? `Current price: ${ctx.price.toFixed(2)} ${ctx.currency}`
      : `Aktueller Kurs: ${ctx.price.toFixed(2)} ${ctx.currency}`,
    isEn
      ? `Daily change: ${ctx.changePercent >= 0 ? "+" : ""}${ctx.changePercent.toFixed(2)}%`
      : `Tagesveränderung: ${ctx.changePercent >= 0 ? "+" : ""}${ctx.changePercent.toFixed(2)}%`,
  ];
  if (ctx.position) {
    lines.push(
      "",
      isEn ? "=== MY POSITION ===" : "=== MEINE POSITION ===",
      isEn
        ? `${ctx.position.shares} shares @ avg ${ctx.position.avgPrice.toFixed(2)} ${ctx.currency}`
        : `${ctx.position.shares} Aktien @ Ø ${ctx.position.avgPrice.toFixed(2)} ${ctx.currency}`,
      isEn
        ? `P/L: ${ctx.position.unrealizedPct >= 0 ? "+" : ""}${ctx.position.unrealizedPct.toFixed(2)}%`
        : `G/V: ${ctx.position.unrealizedPct >= 0 ? "+" : ""}${ctx.position.unrealizedPct.toFixed(2)}%`
    );
  }
  if (ctx.fundamentals) {
    lines.push("", "=== FUNDAMENTALS ===");
    for (const [k, v] of Object.entries(ctx.fundamentals)) {
      if (v != null && v !== "") lines.push(`${k}: ${formatValue(v)}`);
    }
  }
  if (ctx.news && ctx.news.length > 0) {
    lines.push("", "=== NEWS ===");
    for (const n of ctx.news.slice(0, 8)) {
      lines.push(`[${n.publishedAt.slice(0, 10)}] ${n.publisher}: ${n.title}`);
    }
  }
  if (ctx.redditPosts && ctx.redditPosts.length > 0) {
    lines.push(
      "",
      isEn
        ? "=== REDDIT BUZZ (sentiment, not facts) ==="
        : "=== REDDIT-BUZZ (Stimmung, keine Fakten) ==="
    );
    for (const p of ctx.redditPosts.slice(0, 8)) {
      lines.push(`[r/${p.subreddit}, ${p.score}↑, ${p.numComments}💬] ${p.title}`);
    }
  }
  if (ctx.additionalSources && ctx.additionalSources.length > 0) {
    for (const block of ctx.additionalSources) {
      if (block && block.trim()) {
        lines.push("", block);
      }
    }
  }
  lines.push(
    "",
    isEn ? "Return the analysis as JSON." : "Gib die Analyse als JSON zurück."
  );
  return lines.join("\n");
}

function formatValue(v: unknown): string {
  if (typeof v === "number") return v.toFixed(4).replace(/\.?0+$/, "");
  if (typeof v === "string") return v.slice(0, 200);
  return String(v);
}

// ============================================================
// Bull/Bear-Case + Advocatus Diaboli
// ============================================================

export interface BullBearScenario {
  label: string;
  narrative: string;
  keyDrivers: string[];
  priceTarget?: number;
  returnPercent?: number;
  probability?: number;
}

export interface BullBearResult {
  bull: BullBearScenario;
  base: BullBearScenario;
  bear: BullBearScenario;
  advocatusDiaboli: {
    thesis: string;
    counterArguments: string[];
    warningSignals: string[];
  };
  summary: string;
}

function bullBearSystemPrompt(locale: PromptLocale): string {
  if (locale === "en") {
    return `You are a critical investment analyst. Your goal is to examine a stock through three scenarios — Bull, Base, Bear — and additionally, as "Advocatus Diaboli", challenge the prevailing market opinion.

RULES:
- ${alwaysRespondInLanguageDirective(locale)}
- Per scenario: narrative (3-5 sentences), 3-5 key drivers, concrete price target in the trading currency and resulting return in %
- The Advocatus Diaboli must truly counter-argue, not just list risks — which hidden assumptions could be wrong?
- Probabilities (bull/base/bear) must sum to 1.0
- No filler, no investment advice

${jsonOnlyDirective(locale)}
{
  "bull": { "label": "Bull Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 123, "returnPercent": 25, "probability": 0.25 },
  "base": { "label": "Base Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 100, "returnPercent": 5, "probability": 0.5 },
  "bear": { "label": "Bear Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 75, "returnPercent": -20, "probability": 0.25 },
  "advocatusDiaboli": {
    "thesis": "Why the majority might be wrong",
    "counterArguments": ["..."],
    "warningSignals": ["What would confirm the thesis?"]
  },
  "summary": "Expected value and assessment in 1-2 sentences"
}`;
  }
  return `Du bist ein kritischer Investment-Analyst. Dein Ziel ist es, eine Aktie aus drei Szenarien zu betrachten — Bull, Base, Bear — und zusätzlich als "Advocatus Diaboli" die vorherrschende Marktmeinung herauszufordern.

REGELN:
- ${alwaysRespondInLanguageDirective(locale)}
- Pro Szenario: Narrative (3-5 Sätze), 3-5 Key-Drivers, konkretes Kursziel in der Trading-Währung und resultierender Return in %
- Der Advocatus Diaboli muss ECHT gegenargumentieren, nicht nur Risiken auflisten — welche verborgenen Annahmen könnten falsch sein?
- Wahrscheinlichkeiten (bull/base/bear) müssen sich zu 1.0 summieren
- Keine Floskeln, keine Anlageberatung

${jsonOnlyDirective(locale)}
{
  "bull": { "label": "Bull-Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 123, "returnPercent": 25, "probability": 0.25 },
  "base": { "label": "Base-Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 100, "returnPercent": 5, "probability": 0.5 },
  "bear": { "label": "Bear-Case", "narrative": "...", "keyDrivers": ["..."], "priceTarget": 75, "returnPercent": -20, "probability": 0.25 },
  "advocatusDiaboli": {
    "thesis": "Warum die Mehrheit falsch liegen könnte",
    "counterArguments": ["..."],
    "warningSignals": ["Was würde die These bestätigen?"]
  },
  "summary": "Erwartungswert und Einschätzung in 1-2 Sätzen"
}`;
}

export async function analyzeBullBear(
  ctx: StockContext,
  user: SessionUser,
  config?: AIConfig
): Promise<BullBearResult> {
  const cfg = config ?? (await resolveConfig(user));
  const client = getAIClient(cfg);
  const locale = localeFor(user);
  const prompt = buildStockPrompt(ctx, locale);
  const result = await client.call({
    system: bullBearSystemPrompt(locale),
    userPrompt: prompt,
    maxTokens: 2500,
  });
  await logUsage(result, user._id, "bull-bear-analysis");
  return parseJsonResponse<BullBearResult>(result.text || "");
}

// ============================================================
// Thesis-Tracker (prüft eine bestehende Investment-These gegen aktuelle Fakten)
// ============================================================

export interface ThesisCheckContext {
  ticker: string;
  name: string;
  originalThesis: string;
  writtenAt: string; // ISO-Datum
  currentPrice: number;
  avgPrice?: number;
  currency: string;
  fundamentals?: Record<string, unknown> | null;
  news?: Array<{ title: string; publisher: string; publishedAt: string }>;
}

export interface ThesisCheckResult {
  status: "ON_TRACK" | "AT_RISK" | "BROKEN";
  confidence: number;
  verdict: string;
  reasoning: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  recommendedAction: string;
}

function thesisSystemPrompt(locale: PromptLocale): string {
  if (locale === "en") {
    return `You are a reviewer of investment theses. You receive a thesis the investor wrote at an earlier point in time, plus current fundamentals and news. Your job: assess objectively whether the thesis still holds.

RULES:
- ${alwaysRespondInLanguageDirective(locale)}
- Status: ON_TRACK (thesis still carries), AT_RISK (parts of the thesis are shaky), BROKEN (foundation of the thesis has fallen away)
- Name concretely which facts support or contradict the thesis
- Recommended action must be concrete (hold, add, reduce, sell)
- No investment advice — purely analytical assessment

JSON:
{
  "status": "ON_TRACK|AT_RISK|BROKEN",
  "confidence": 0.0-1.0,
  "verdict": "1-2 sentence verdict",
  "reasoning": "3-5 sentence reasoning",
  "supportingEvidence": ["..."],
  "contradictingEvidence": ["..."],
  "recommendedAction": "..."
}`;
  }
  return `Du bist Gutachter für Investment-Thesen. Du erhältst eine These, die der Investor zu einem früheren Zeitpunkt formuliert hat, sowie aktuelle Fundamentals und News. Deine Aufgabe: objektiv bewerten, ob die These noch hält.

REGELN:
- ${alwaysRespondInLanguageDirective(locale)}
- Status: ON_TRACK (These trägt weiterhin), AT_RISK (Teile der These wackeln), BROKEN (Fundament der These ist entfallen)
- Nenne konkret, welche Fakten die These stützen bzw. widerlegen
- Empfohlene Aktion muss konkret sein (halten, nachlegen, reduzieren, verkaufen)
- Keine Anlageberatung — rein analytische Bewertung

JSON:
{
  "status": "ON_TRACK|AT_RISK|BROKEN",
  "confidence": 0.0-1.0,
  "verdict": "1-2 Sätze Fazit",
  "reasoning": "3-5 Sätze Begründung",
  "supportingEvidence": ["..."],
  "contradictingEvidence": ["..."],
  "recommendedAction": "..."
}`;
}

export async function checkThesis(
  ctx: ThesisCheckContext,
  user: SessionUser,
  config?: AIConfig
): Promise<ThesisCheckResult> {
  const cfg = config ?? (await resolveConfig(user));
  const client = getAIClient(cfg);
  const locale = localeFor(user);
  const isEn = locale === "en";
  const lines: string[] = [
    isEn
      ? `Original thesis on ${ctx.ticker} (${ctx.name}), written on ${ctx.writtenAt.slice(0, 10)}:`
      : `Original-These zu ${ctx.ticker} (${ctx.name}), geschrieben am ${ctx.writtenAt.slice(0, 10)}:`,
    `"${ctx.originalThesis}"`,
    "",
    isEn
      ? `Current price: ${ctx.currentPrice.toFixed(2)} ${ctx.currency}`
      : `Aktueller Kurs: ${ctx.currentPrice.toFixed(2)} ${ctx.currency}`,
  ];
  if (ctx.avgPrice != null) {
    const deltaPct = ((ctx.currentPrice - ctx.avgPrice) / ctx.avgPrice) * 100;
    lines.push(
      isEn
        ? `Entry price: ${ctx.avgPrice.toFixed(2)} ${ctx.currency} → ${
            deltaPct >= 0 ? "+" : ""
          }${deltaPct.toFixed(2)}%`
        : `Einstandskurs: ${ctx.avgPrice.toFixed(2)} ${ctx.currency} → ${
            deltaPct >= 0 ? "+" : ""
          }${deltaPct.toFixed(2)}%`
    );
  }
  if (ctx.fundamentals) {
    lines.push(
      "",
      isEn ? "=== CURRENT FUNDAMENTALS ===" : "=== AKTUELLE FUNDAMENTALS ==="
    );
    for (const [k, v] of Object.entries(ctx.fundamentals)) {
      if (v != null && v !== "") lines.push(`${k}: ${formatValue(v)}`);
    }
  }
  if (ctx.news && ctx.news.length > 0) {
    lines.push(
      "",
      isEn ? "=== RECENT NEWS (newest first) ===" : "=== AKTUELLE NEWS (jüngste zuerst) ==="
    );
    for (const n of ctx.news.slice(0, 10)) {
      lines.push(`[${n.publishedAt.slice(0, 10)}] ${n.publisher}: ${n.title}`);
    }
  }
  lines.push(
    "",
    isEn
      ? "Validate the thesis against these facts. Respond as JSON."
      : "Prüfe die These gegen diese Fakten. Antworte als JSON."
  );

  const result = await client.call({
    system: thesisSystemPrompt(locale),
    userPrompt: lines.join("\n"),
    maxTokens: 1500,
  });
  await logUsage(result, user._id, "thesis-check");
  return parseJsonResponse<ThesisCheckResult>(result.text || "");
}

// ============================================================
// Portfolio Analysis
// ============================================================

export interface PortfolioPositionContext {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currency: string;
  marketValue: number;
  weight: number;
  sector?: string;
}

export interface PortfolioAnalysisResult {
  summary: string;
  diversification: string;
  concentrationRisks: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

const PORTFOLIO_SYSTEM_PROMPT = `Portfolio-Manager. Bewerte Diversifikation, Klumpenrisiken, Risikoprofil. Gib konkrete Vorschläge. Deutsch.

JSON:
{
  "summary": "Kernaussage",
  "diversification": "Einschätzung",
  "concentrationRisks": ["..."],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": ["..."],
  "riskLevel": "LOW|MEDIUM|HIGH"
}`;

export async function analyzePortfolio(
  positions: PortfolioPositionContext[],
  totalValue: number,
  baseCurrency: string,
  user: SessionUser,
  options: { lookThroughBlock?: string } = {}
): Promise<PortfolioAnalysisResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines = [
    `Portfolio: ${totalValue.toFixed(2)} ${baseCurrency}, ${positions.length} Positionen.`,
    "",
    "=== POSITIONEN ===",
  ];
  for (const p of positions) {
    lines.push(
      `${p.ticker} (${p.name})${p.sector ? ` [${p.sector}]` : ""}: ${p.shares} @ Ø ${p.avgPrice.toFixed(2)} ${p.currency}, Wert ${p.marketValue.toFixed(2)} ${baseCurrency}, ${p.weight.toFixed(1)}%`
    );
  }
  if (options.lookThroughBlock && options.lookThroughBlock.trim()) {
    lines.push("", options.lookThroughBlock.trim());
    lines.push(
      "",
      "Berücksichtige in deiner Klumpenrisiko- und Diversifikations-Analyse explizit die effektive Aktien-/Sektor-Exposure (ETF-Look-Through), nicht nur die direkten Positionen."
    );
  }

  const result = await client.call({
    system: PORTFOLIO_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 2000,
  });

  await logUsage(result, user._id, "portfolio-analysis");
  return parseJsonResponse<PortfolioAnalysisResult>(result.text || "");
}

// ============================================================
// Market Radar (Tool Use)
// ============================================================

export type Horizon = "long" | "swing" | "short";

export interface MarketIdea {
  ticker: string;
  name: string;
  thesis: string;
  whyNow: string;
  risks: string[];
  suggestedAllocation: string;
}

export interface MarketRadarResult {
  marketOverview: string;
  sectorRotation: string;
  ideas: MarketIdea[];
}

const HORIZON_CONTEXT: Record<Horizon, string> = {
  long: `ZEITHORIZONT: Langfristig (3-10+ Jahre). Value/Qualität, strukturelle Trends, Dividendenaristokraten, ETFs ok. Keine Hot Stocks.`,
  swing: `ZEITHORIZONT: Swing (1-3 Monate). Sektor-Rotationen, Katalysatoren, Relative Strength, zyklische Titel.`,
  short: `ZEITHORIZONT: Kurzfristig (Tage-Wochen) — SEHR SPEKULATIV. Ohne Live-Daten unzuverlässig.`,
};

const MARKET_SYSTEM_PROMPT = `Investment-Stratege. Reale Ticker (Yahoo-Format: SAP.DE, AAPL, NESN.SW, ASML.AS). Deutsch.`;

const MARKET_TOOL: AIToolSchema = {
  name: "submit_market_radar",
  description: "Submit market radar ideas",
  input_schema: {
    type: "object",
    properties: {
      marketOverview: { type: "string" },
      sectorRotation: { type: "string" },
      ideas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            name: { type: "string" },
            thesis: { type: "string" },
            whyNow: { type: "string" },
            risks: { type: "array", items: { type: "string" } },
            suggestedAllocation: { type: "string" },
          },
          required: ["ticker", "name", "thesis", "whyNow", "risks", "suggestedAllocation"],
        },
      },
    },
    required: ["marketOverview", "sectorRotation", "ideas"],
  },
};

export interface MarketRadarOptions {
  /** Vorgerenderter FRED-Makro-Block (vom Endpoint geladen). */
  macroBlock?: string;
  /** Vorgerenderter Block mit Tickers, die aktuell starke Aufmerksamkeit ziehen
   *  (Wikipedia/Google-Spike) — als Hinweis worauf der Markt gerade schaut. */
  attentionBlock?: string;
}

export async function marketRadar(
  existingTickers: string[],
  focus: string | undefined,
  horizon: Horizon,
  user: SessionUser,
  options: MarketRadarOptions = {}
): Promise<MarketRadarResult & { horizon: Horizon }> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const parts = [
    HORIZON_CONTEXT[horizon],
    "",
    "Scanne Europa + USA + Asien und schlage 5-8 Aktien/ETFs vor, die NICHT im Portfolio sind.",
    "",
    `Bereits im Portfolio: ${existingTickers.join(", ") || "—"}`,
  ];
  if (focus?.trim()) parts.push("", `Fokus: ${focus}`);
  if (options.macroBlock?.trim()) {
    parts.push(
      "",
      options.macroBlock.trim(),
      "",
      "Berücksichtige das aktuelle Makro-Umfeld bei der Sektor-Rotation und den Ideen — z. B. Yield-Curve, Inflations-Trend, VIX, FX."
    );
  }
  if (options.attentionBlock?.trim()) {
    parts.push(
      "",
      options.attentionBlock.trim(),
      "",
      "Diese Tickers ziehen aktuell besonders viel Aufmerksamkeit (Wikipedia/Google-Suchen). Das ist KEIN Kaufsignal — aber ein Hinweis, in welchen Bereichen sich gerade News, Catalysts oder Themenrotation abspielen. Nutze das zur Inspiration für Sektor-Rotation und Warum-jetzt-Argumente, ohne diese Tickers selbst vorzuschlagen, wenn sie schon im Portfolio sind."
    );
  }

  const result = await client.call({
    system: MARKET_SYSTEM_PROMPT,
    userPrompt: parts.join("\n"),
    maxTokens: 4000,
    tool: MARKET_TOOL,
  });

  await logUsage(result, user._id, "market-radar");
  return { ...(result.toolInput as MarketRadarResult), horizon };
}

// ============================================================
// Position Sizing
// ============================================================

export interface SizingContext {
  ticker: string;
  name: string;
  currentPrice: number;
  currency: string;
  fxRate: number;
  baseCurrency: string;
  portfolioValueBase: number;
  positionCount: number;
  existingPosition?: {
    shares: number;
    avgPrice: number;
    marketValueBase: number;
    weightPercent: number;
    unrealizedPct: number;
  };
  fundamentals?: Record<string, unknown> | null;
  latestRecommendation?: string;
  riskProfile: "conservative" | "moderate" | "aggressive";
}

export interface SizingResult {
  suggestedAmountBase: number;
  suggestedShares: number;
  suggestedWeightPercent: number;
  maxWeightPercent: number;
  confidence: number;
  reasoning: string;
  warnings: string[];
  alternatives: string[];
}

const SIZING_SYSTEM_PROMPT = `Position-Sizing für Privatanleger. Regeln:
- Konservativ: max 5%, Ziel 2-3%
- Moderat: max 10%, Ziel 3-7%
- Aggressiv: max 15%, Ziel 5-10%
- Volatile Titel restriktiver, breite ETFs bis 25-40% ok
- Bestehende Position — nur ZUSÄTZLICHER Betrag
- Unter 500€/Trade wenig sinnvoll

Deutsch, JSON:
{
  "suggestedAmountBase": 1500,
  "suggestedShares": 10,
  "suggestedWeightPercent": 5,
  "maxWeightPercent": 8,
  "confidence": 0.75,
  "reasoning": "2-4 Sätze",
  "warnings": ["..."],
  "alternatives": ["..."]
}`;

export async function sizePosition(
  ctx: SizingContext,
  user: SessionUser
): Promise<SizingResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines = [
    `Wie viel in ${ctx.ticker} (${ctx.name}) investieren?`,
    "",
    "=== PORTFOLIO ===",
    `Gesamtwert: ${ctx.portfolioValueBase.toFixed(2)} ${ctx.baseCurrency}`,
    `Positionen: ${ctx.positionCount}`,
    `Risikoprofil: ${ctx.riskProfile}`,
    "",
    "=== AKTIE ===",
    `Kurs: ${ctx.currentPrice.toFixed(2)} ${ctx.currency} (FX ${ctx.currency}→${ctx.baseCurrency}: ${ctx.fxRate.toFixed(4)})`,
  ];
  if (ctx.existingPosition) {
    lines.push(
      "",
      "=== BESTEHENDE POSITION ===",
      `${ctx.existingPosition.shares} Aktien @ Ø ${ctx.existingPosition.avgPrice.toFixed(2)} ${ctx.currency}`,
      `Wert ${ctx.existingPosition.marketValueBase.toFixed(2)} ${ctx.baseCurrency}, ${ctx.existingPosition.weightPercent.toFixed(1)}% Gewicht, ${ctx.existingPosition.unrealizedPct.toFixed(1)}% G/V`
    );
  } else {
    lines.push("", "=== BESTEHENDE POSITION === Keine.");
  }
  if (ctx.fundamentals) {
    lines.push("", "=== FUNDAMENTALS ===");
    for (const [k, v] of Object.entries(ctx.fundamentals)) {
      if (v != null && v !== "" && typeof v !== "object") {
        lines.push(`${k}: ${typeof v === "number" ? v.toFixed(4).replace(/\.?0+$/, "") : String(v).slice(0, 150)}`);
      }
    }
  }
  if (ctx.latestRecommendation) {
    lines.push("", `Empfehlung: ${ctx.latestRecommendation}`);
  }
  lines.push("", `Antwort JSON. Beträge in ${ctx.baseCurrency}, Aktien ganzzahlig.`);

  const result = await client.call({
    system: SIZING_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 1200,
  });

  await logUsage(result, user._id, "position-sizing");
  return parseJsonResponse<SizingResult>(result.text || "");
}

// ============================================================
// Relationship Map (Tool Use)
// ============================================================

export type RelationshipType =
  | "customer"
  | "supplier"
  | "partner"
  | "competitor"
  | "investor"
  | "subsidiary";

export interface Relationship {
  ticker: string | null;
  name: string;
  type: RelationshipType;
  description: string;
  strength: "strong" | "medium" | "weak";
}

export interface RelationshipMapResult {
  summary: string;
  relationships: Relationship[];
}

const RELATIONSHIP_SYSTEM_PROMPT = `Geschäftsgeflecht börsennotierter Unternehmen.
REGELN:
- Nur dokumentierte, öffentlich bekannte Beziehungen
- Echte Ticker (Yahoo-Format), nicht gelistet: ticker = null
- Unsicher: weglassen
- Deutsch, 1 Satz pro Beziehung, konkret
- Strength: strong (geschäftskritisch), medium, weak
- 8-20 hochwertige Beziehungen
- Typen: customer, supplier, partner, competitor, investor, subsidiary`;

const RELATIONSHIP_TOOL: AIToolSchema = {
  name: "submit_relationship_map",
  description: "Submit the business relationship map",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["customer", "supplier", "partner", "competitor", "investor", "subsidiary"],
            },
            description: { type: "string" },
            strength: { type: "string", enum: ["strong", "medium", "weak"] },
          },
          required: ["name", "type", "description", "strength"],
        },
      },
    },
    required: ["summary", "relationships"],
  },
};

export async function analyzeRelationships(
  ticker: string,
  name: string,
  user: SessionUser
): Promise<RelationshipMapResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const result = await client.call({
    system: RELATIONSHIP_SYSTEM_PROMPT,
    userPrompt: `Analysiere das Geschäftsgeflecht von ${name} (${ticker}). Liste Kunden, Lieferanten, Partner, Konkurrenten und relevante Investoren/Tochterfirmen.`,
    maxTokens: 4000,
    tool: RELATIONSHIP_TOOL,
  });

  await logUsage(result, user._id, "relationship-map");
  return result.toolInput as RelationshipMapResult;
}

// ============================================================
// Chart Vision Analysis
// ============================================================

export interface ChartVisionContext {
  ticker?: string;
  name?: string;
  currentPrice?: number;
  currency?: string;
  range?: string;
  activeIndicators?: string[];
  image: { base64: string; mimeType: string };
  priceContext?: {
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    last10Closes?: number[];
  };
}

export interface ChartPattern {
  name: string;
  confidence: "high" | "medium" | "low";
  implication: "bullish" | "bearish" | "neutral";
  description: string;
}

export interface ChartVisionResult {
  trend: "uptrend" | "downtrend" | "sideways";
  overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  summary: string;
  patterns: ChartPattern[];
  supportLevels: number[];
  resistanceLevels: number[];
  indicatorObservations: string[];
  keyObservations: string[];
  risks: string[];
  tradingSetup: string;
}

const VISION_SYSTEM_PROMPT = `Du bist ein erfahrener technischer Chart-Analyst. Du bekommst ein Chart-Bild und sollst es interpretieren.

Identifiziere:
- Chart-Muster: Cup-and-Handle, Flagge, Wimpel, Doppelboden, Doppeltop, Kopf-Schulter (auch invers), aufsteigendes/absteigendes Dreieck, symmetrisches Dreieck, Keil, Megaphon, Rechteck, Tasse
- Support- und Resistance-Levels: konkrete Preise wo der Kurs mehrfach gedreht hat
- Trendlinien und Kanäle
- Breakout-Signale an bedeutenden Niveaus
- Volumen-Muster falls Volumen sichtbar
- Indikator-Signale wenn Indikatoren (RSI, MACD, BB, etc.) im Bild sind

Antworte auf Deutsch, konkret mit Zahlen aus dem Chart. Keine Floskeln. Wenn Muster unsicher: als "low confidence" kennzeichnen.

Antworte AUSSCHLIESSLICH in JSON:
{
  "trend": "uptrend" | "downtrend" | "sideways",
  "overallSignal": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "summary": "2-3 Sätze Kernaussage",
  "patterns": [
    {
      "name": "Cup and Handle",
      "confidence": "high" | "medium" | "low",
      "implication": "bullish" | "bearish" | "neutral",
      "description": "Wo im Chart und woran erkennbar"
    }
  ],
  "supportLevels": [142.50, 138.00],
  "resistanceLevels": [165.00, 172.30],
  "indicatorObservations": ["RSI-Divergenz bullish", ...],
  "keyObservations": ["..."],
  "risks": ["..."],
  "tradingSetup": "Konkrete Trade-Idee oder 'Warten' — wann Einstieg, wo Stop, wo Ziel"
}`;

export async function analyzeChartVision(
  ctx: ChartVisionContext,
  user: SessionUser
): Promise<ChartVisionResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = ["Analysiere das Chart-Bild technisch."];
  if (ctx.ticker) {
    lines.push(
      "",
      "=== KONTEXT ===",
      `Ticker: ${ctx.ticker}${ctx.name ? ` (${ctx.name})` : ""}`
    );
    if (ctx.currentPrice != null) {
      lines.push(
        `Aktueller Kurs: ${ctx.currentPrice.toFixed(2)} ${ctx.currency || ""}`
      );
    }
    if (ctx.range) lines.push(`Zeitraum: ${ctx.range}`);
    if (ctx.activeIndicators && ctx.activeIndicators.length > 0) {
      lines.push(`Aktive Indikatoren im Chart: ${ctx.activeIndicators.join(", ")}`);
    }
    if (ctx.priceContext?.fiftyTwoWeekHigh != null && ctx.priceContext?.fiftyTwoWeekLow != null) {
      lines.push(
        `52W-Range: ${ctx.priceContext.fiftyTwoWeekLow.toFixed(2)} – ${ctx.priceContext.fiftyTwoWeekHigh.toFixed(2)}`
      );
    }
    if (ctx.priceContext?.last10Closes && ctx.priceContext.last10Closes.length > 0) {
      lines.push(
        `Letzte 10 Schlusskurse: ${ctx.priceContext.last10Closes.map((c) => c.toFixed(2)).join(", ")}`
      );
    }
  } else {
    lines.push(
      "",
      "Kein Ticker-Kontext — analysiere rein visuell."
    );
  }
  lines.push("", "Gib deine Analyse als JSON zurück (Schema im System-Prompt).");

  const result = await client.call({
    system: VISION_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 2500,
    image: ctx.image,
  });

  await logUsage(result, user._id, "chart-vision");
  return parseJsonResponse<ChartVisionResult>(result.text || "");
}

// ============================================================
// Earnings Reaction Analysis
// ============================================================

export interface EarningsReactionContext {
  ticker: string;
  name: string;
  currentPrice: number;
  currency: string;
  recentPriceChange30d: number;
  recentPriceChange5d: number;
  lastEarningsDate?: string;
  quarterlyEPS: Array<{ date: string; actual?: number; estimate?: number }>;
  quarterlyRevenue: Array<{ date: string; actual?: number; estimate?: number }>;
  news: Array<{ title: string; publisher: string; publishedAt: string }>;
}

export interface EarningsReactionResult {
  headline: string;
  summary: string;
  beatMiss: "beat" | "miss" | "mixed" | "inline" | "unknown";
  guidanceInterpretation: string;
  marketReactionAnalysis: string;
  recommendation: "BUY" | "HOLD" | "SELL" | "REDUCE" | "ACCUMULATE";
  confidence: number;
  reasoning: string;
  risks: string[];
  opportunities: string[];
}

const EARNINGS_REACTION_SYSTEM_PROMPT = `Finanzanalyst für Quartalszahlen und Kursreaktionen. Du bekommst EPS-/Umsatz-Historie, News und die jüngste Kursbewegung. Interpretiere Beat/Miss, Guidance-Wirkung und die Marktreaktion.

REGELN:
- Deutsch
- beatMiss: "beat" (klar über Konsens), "miss" (unter), "mixed" (EPS beat, Rev miss o. umgekehrt), "inline", "unknown" (ohne Estimate-Daten)
- marketReactionAnalysis: ordne die 5T-/30T-Bewegung ein — überreagiert, unterreagiert, erwartungsgemäß
- guidanceInterpretation: was impliziert die aktuellste Guidance, falls aus News ableitbar

JSON:
{
  "headline": "Kurzfassung in einer Zeile",
  "summary": "2-3 Sätze",
  "beatMiss": "beat|miss|mixed|inline|unknown",
  "guidanceInterpretation": "...",
  "marketReactionAnalysis": "...",
  "recommendation": "BUY|HOLD|SELL|REDUCE|ACCUMULATE",
  "confidence": 0.0-1.0,
  "reasoning": "3-5 Sätze",
  "risks": ["..."],
  "opportunities": ["..."]
}`;

export async function analyzeEarningsReaction(
  ctx: EarningsReactionContext,
  user: SessionUser
): Promise<EarningsReactionResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = [
    `Quartalszahlen-Analyse für ${ctx.ticker} (${ctx.name}).`,
    "",
    "=== KURS ===",
    `Aktuell: ${ctx.currentPrice.toFixed(2)} ${ctx.currency}`,
    `5T: ${ctx.recentPriceChange5d >= 0 ? "+" : ""}${ctx.recentPriceChange5d.toFixed(2)}%`,
    `30T: ${ctx.recentPriceChange30d >= 0 ? "+" : ""}${ctx.recentPriceChange30d.toFixed(2)}%`,
  ];
  if (ctx.lastEarningsDate) {
    lines.push(`Letzter Earnings-Termin: ${ctx.lastEarningsDate.slice(0, 10)}`);
  }
  if (ctx.quarterlyEPS.length > 0) {
    lines.push("", "=== EPS (Actual / Estimate) ===");
    for (const q of ctx.quarterlyEPS.slice(-6)) {
      const a = q.actual != null ? q.actual.toFixed(2) : "—";
      const e = q.estimate != null ? q.estimate.toFixed(2) : "—";
      lines.push(`${q.date.slice(0, 10)}: ${a} / ${e}`);
    }
  }
  if (ctx.quarterlyRevenue.length > 0) {
    lines.push("", "=== UMSATZ (Actual / Estimate) ===");
    for (const q of ctx.quarterlyRevenue.slice(-6)) {
      const a = q.actual != null ? q.actual.toExponential(2) : "—";
      const e = q.estimate != null ? q.estimate.toExponential(2) : "—";
      lines.push(`${q.date.slice(0, 10)}: ${a} / ${e}`);
    }
  }
  if (ctx.news.length > 0) {
    lines.push("", "=== NEWS ===");
    for (const n of ctx.news.slice(0, 10)) {
      lines.push(`[${n.publishedAt.slice(0, 10)}] ${n.publisher}: ${n.title}`);
    }
  }
  lines.push("", "Antwort als JSON.");

  const result = await client.call({
    system: EARNINGS_REACTION_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 1500,
  });

  await logUsage(result, user._id, "earnings-reaction");
  return parseJsonResponse<EarningsReactionResult>(result.text || "");
}

// ============================================================
// Indicator Analysis
// ============================================================

export interface IndicatorSnapshot {
  key: string;
  label: string;
  category: string;
  currentValues: Record<string, number | null>;
  recentSeries?: Record<string, Array<number | null>>;
  signalRanges?: string;
}

export interface IndicatorsContext {
  ticker: string;
  name: string;
  currentPrice: number;
  currency: string;
  priceContext: {
    changePercent: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    position52W?: number;
    last10Closes: number[];
  };
  indicators: IndicatorSnapshot[];
}

export interface IndicatorAnalysisItem {
  key: string;
  label: string;
  signal: "bullish" | "bearish" | "neutral";
  currentValue?: string;
  interpretation: string;
}

export interface AnalyzeIndicatorsResult {
  overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  overallReasoning: string;
  indicatorAnalysis: IndicatorAnalysisItem[];
  divergences: string[];
  keyObservations: string[];
  riskFactors: string[];
  suggestedActions: string[];
}

const INDICATORS_SYSTEM_PROMPT = `Technischer Analyst. Du bekommst aktuelle Werte von Chart-Indikatoren (Oszillatoren, Trendfolge, Gleitende Durchschnitte) + Kurs-Kontext. Interpretiere jeden aktiven Indikator, suche Divergenzen, fasse ein Gesamtsignal zusammen.

REGELN:
- Deutsch
- Pro Indikator: signal (bullish/bearish/neutral), currentValue (1-2 Zahlen als String), interpretation (1-2 Sätze)
- overallSignal: BULLISH/BEARISH/NEUTRAL
- divergences: explizite Widersprüche zwischen Indikatoren oder zwischen Indikator und Kurs
- Keine Floskeln

JSON:
{
  "overallSignal": "BULLISH|BEARISH|NEUTRAL",
  "confidence": 0.0-1.0,
  "overallReasoning": "2-4 Sätze",
  "indicatorAnalysis": [
    { "key": "RSI", "label": "RSI (14)", "signal": "bullish|bearish|neutral", "currentValue": "58.2", "interpretation": "..." }
  ],
  "divergences": ["..."],
  "keyObservations": ["..."],
  "riskFactors": ["..."],
  "suggestedActions": ["..."]
}`;

export async function analyzeIndicators(
  ctx: IndicatorsContext,
  user: SessionUser
): Promise<AnalyzeIndicatorsResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = [
    `Technische Indikator-Analyse für ${ctx.ticker} (${ctx.name}).`,
    "",
    "=== KURS-KONTEXT ===",
    `Aktuell: ${ctx.currentPrice.toFixed(2)} ${ctx.currency}`,
    `Tagesveränderung: ${ctx.priceContext.changePercent >= 0 ? "+" : ""}${ctx.priceContext.changePercent.toFixed(2)}%`,
  ];
  if (ctx.priceContext.fiftyTwoWeekHigh != null && ctx.priceContext.fiftyTwoWeekLow != null) {
    lines.push(
      `52W-Range: ${ctx.priceContext.fiftyTwoWeekLow.toFixed(2)} – ${ctx.priceContext.fiftyTwoWeekHigh.toFixed(2)}`
    );
  }
  if (ctx.priceContext.position52W != null) {
    lines.push(`Position innerhalb 52W-Range: ${ctx.priceContext.position52W.toFixed(1)}%`);
  }
  if (ctx.priceContext.last10Closes.length > 0) {
    lines.push(
      `Letzte 10 Closes: ${ctx.priceContext.last10Closes.map((c) => c.toFixed(2)).join(", ")}`
    );
  }

  lines.push("", "=== AKTIVE INDIKATOREN ===");
  for (const ind of ctx.indicators) {
    lines.push("", `--- ${ind.label} [${ind.category}] (key: ${ind.key}) ---`);
    const vals = Object.entries(ind.currentValues)
      .map(([k, v]) => `${k}: ${v == null ? "—" : Number(v).toFixed(3).replace(/\.?0+$/, "")}`)
      .join(", ");
    lines.push(`Aktuell: ${vals}`);
    if (ind.signalRanges) lines.push(`Signal-Logik: ${ind.signalRanges}`);
    if (ind.recentSeries) {
      for (const [k, arr] of Object.entries(ind.recentSeries)) {
        const fmt = arr
          .slice(-10)
          .map((v) => (v == null ? "—" : Number(v).toFixed(2)))
          .join(", ");
        lines.push(`${k} (letzte 10): ${fmt}`);
      }
    }
  }
  lines.push("", "Antwort als JSON — pro Indikator ein Eintrag in indicatorAnalysis mit key exakt wie oben.");

  const result = await client.call({
    system: INDICATORS_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 2500,
  });

  await logUsage(result, user._id, "indicator-analysis");
  return parseJsonResponse<AnalyzeIndicatorsResult>(result.text || "");
}

// ============================================================
// Peer Comparison
// ============================================================

export interface PeerComparisonSide {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  fundamentals: Record<string, unknown> | null;
}

export interface PeerComparisonContext {
  a: PeerComparisonSide;
  b: PeerComparisonSide;
}

export interface CategoryComparison {
  a: string;
  b: string;
  winner: "A" | "B" | "tie";
}

export interface ComparePeersResult {
  summary: string;
  valuation: CategoryComparison;
  growth: CategoryComparison;
  profitability: CategoryComparison;
  risks: CategoryComparison;
  moat: CategoryComparison;
  verdict: "A" | "B" | "tie";
  verdictReasoning: string;
  scenario: string;
}

const PEER_COMPARE_SYSTEM_PROMPT = `Vergleichender Aktienanalyst. Stelle Aktie A und Aktie B in fünf Kategorien gegenüber: Bewertung, Wachstum, Profitabilität, Risiken, Burggraben.

REGELN:
- Deutsch, je 1-2 knackige Sätze pro Seite und Kategorie
- winner: "A", "B" oder "tie" pro Kategorie
- Gesamt-Verdict + 2-3 Sätze Begründung
- scenario: "Wann ist A besser geeignet? Wann B?" — ein kurzer Absatz

JSON:
{
  "summary": "Einordnung beider in 1-2 Sätzen",
  "valuation": {"a":"...", "b":"...", "winner":"A|B|tie"},
  "growth": {"a":"...", "b":"...", "winner":"A|B|tie"},
  "profitability": {"a":"...", "b":"...", "winner":"A|B|tie"},
  "risks": {"a":"...", "b":"...", "winner":"A|B|tie"},
  "moat": {"a":"...", "b":"...", "winner":"A|B|tie"},
  "verdict": "A|B|tie",
  "verdictReasoning": "...",
  "scenario": "..."
}`;

function formatFundamentalsBlock(f: Record<string, unknown> | null): string {
  if (!f) return "— keine Fundamentals —";
  const lines: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "") continue;
    if (typeof v === "number") lines.push(`${k}: ${v.toFixed(4).replace(/\.?0+$/, "")}`);
    else if (typeof v === "string") lines.push(`${k}: ${v.slice(0, 200)}`);
  }
  return lines.join("\n");
}

export async function comparePeers(
  ctx: PeerComparisonContext,
  user: SessionUser
): Promise<ComparePeersResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const prompt = [
    `Vergleiche zwei Aktien.`,
    "",
    `=== AKTIE A: ${ctx.a.ticker} (${ctx.a.name}) ===`,
    `Kurs: ${ctx.a.price.toFixed(2)} ${ctx.a.currency}`,
    formatFundamentalsBlock(ctx.a.fundamentals),
    "",
    `=== AKTIE B: ${ctx.b.ticker} (${ctx.b.name}) ===`,
    `Kurs: ${ctx.b.price.toFixed(2)} ${ctx.b.currency}`,
    formatFundamentalsBlock(ctx.b.fundamentals),
    "",
    "Antwort als JSON.",
  ].join("\n");

  const result = await client.call({
    system: PEER_COMPARE_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: 2000,
  });

  await logUsage(result, user._id, "peer-compare");
  return parseJsonResponse<ComparePeersResult>(result.text || "");
}

// ============================================================
// Portfolio Delta
// ============================================================

export interface PortfolioDeltaContext {
  days: number;
  baseCurrency: string;
  currentValueBase: number;
  previousValueBase: number;
  currentCostBase: number;
  previousCostBase: number;
  topGainers: Array<{ ticker: string; name: string; pctChange: number }>;
  topLosers: Array<{ ticker: string; name: string; pctChange: number }>;
  newPositions: Array<{ ticker: string; shares: number; avgPrice: number; currency: string }>;
  closedPositions: Array<{ ticker: string; shares: number; price: number; currency: string }>;
  realizedGainsBase: number;
  dividendsReceived: Array<{ ticker: string; amount: number; currency: string }>;
  transactionCount: number;
}

export interface AnalyzePortfolioDeltaResult {
  summary: string;
  performanceAnalysis: string;
  movementExplained: string;
  suggestions: string[];
}

const PORTFOLIO_DELTA_SYSTEM_PROMPT = `Portfolio-Historiker. Du bekommst einen Snapshot vor X Tagen und den aktuellen Stand. Erkläre, was sich verändert hat und warum.

REGELN:
- Deutsch
- Zahlen nennen (Δ in Basiswährung + %)
- Klar benennen: Marktbewegung vs. eigene Transaktionen
- 2-4 Handlungsvorschläge, konkret

JSON:
{
  "summary": "1-2 Sätze Gesamtentwicklung",
  "performanceAnalysis": "3-5 Sätze: Performer/Verlierer, realisierte Gewinne, Dividenden",
  "movementExplained": "3-5 Sätze: Was trieb das Δ — Markt, Einzelwerte, eigene Trades",
  "suggestions": ["..."]
}`;

export async function analyzePortfolioDelta(
  ctx: PortfolioDeltaContext,
  user: SessionUser
): Promise<AnalyzePortfolioDeltaResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const delta = ctx.currentValueBase - ctx.previousValueBase;
  const deltaPct = ctx.previousValueBase > 0 ? (delta / ctx.previousValueBase) * 100 : 0;
  const costDelta = ctx.currentCostBase - ctx.previousCostBase;

  const lines: string[] = [
    `Portfolio-Entwicklung über ${ctx.days} Tage, Basis ${ctx.baseCurrency}.`,
    "",
    "=== WERTE ===",
    `Vor ${ctx.days}T: ${ctx.previousValueBase.toFixed(2)}`,
    `Aktuell:         ${ctx.currentValueBase.toFixed(2)}`,
    `Δ:               ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%)`,
    `Einstandskosten Δ: ${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(2)} (eigene Käufe/Verkäufe)`,
    `Realisierte Gewinne: ${ctx.realizedGainsBase.toFixed(2)}`,
    `Transaktionen: ${ctx.transactionCount}`,
  ];
  if (ctx.topGainers.length > 0) {
    lines.push("", "=== TOP-PERFORMER ===");
    for (const g of ctx.topGainers) {
      lines.push(`${g.ticker} (${g.name}): ${g.pctChange >= 0 ? "+" : ""}${g.pctChange.toFixed(2)}%`);
    }
  }
  if (ctx.topLosers.length > 0) {
    lines.push("", "=== TOP-VERLIERER ===");
    for (const l of ctx.topLosers) {
      lines.push(`${l.ticker} (${l.name}): ${l.pctChange >= 0 ? "+" : ""}${l.pctChange.toFixed(2)}%`);
    }
  }
  if (ctx.newPositions.length > 0) {
    lines.push("", "=== NEUE POSITIONEN ===");
    for (const n of ctx.newPositions) {
      lines.push(`${n.ticker}: ${n.shares} @ ${n.avgPrice.toFixed(2)} ${n.currency}`);
    }
  }
  if (ctx.closedPositions.length > 0) {
    lines.push("", "=== GESCHLOSSENE POSITIONEN ===");
    for (const c of ctx.closedPositions) {
      lines.push(`${c.ticker}: ${c.shares} @ ${c.price.toFixed(2)} ${c.currency}`);
    }
  }
  if (ctx.dividendsReceived.length > 0) {
    lines.push("", "=== DIVIDENDEN ===");
    for (const d of ctx.dividendsReceived) {
      lines.push(`${d.ticker}: ${d.amount.toFixed(2)} ${d.currency}`);
    }
  }
  lines.push("", "Antwort als JSON.");

  const result = await client.call({
    system: PORTFOLIO_DELTA_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 1800,
  });

  await logUsage(result, user._id, "portfolio-delta");
  return parseJsonResponse<AnalyzePortfolioDeltaResult>(result.text || "");
}

// ============================================================
// Portfolio Gaps
// ============================================================

export interface SectorAllocation {
  label: string;
  weight: number;
  tickers: string[];
}

export interface RegionAllocation {
  label: string;
  weight: number;
  tickers: string[];
}

export interface PortfolioGapsContext {
  totalValueBase: number;
  baseCurrency: string;
  sectors: SectorAllocation[];
  regions: RegionAllocation[];
  allTickers: string[];
}

export interface FindPortfolioGapsResult {
  summary: string;
  sectorGaps: string[];
  regionGaps: string[];
  suggestions: string[];
  diversificationScore: number;
}

const PORTFOLIO_GAPS_SYSTEM_PROMPT = `Diversifikations-Analyst. Du bekommst die Sektor- und Regionen-Allocation eines Portfolios. Identifiziere strukturelle Lücken.

REGELN:
- Deutsch
- sectorGaps / regionGaps: was fehlt oder ist untergewichtet, konkret benennen
- suggestions: 3-6 konkrete Vorschläge (Sektor/Region + Beispiel-Tickers falls sinnvoll)
- diversificationScore: 0-100 (Gesamtnote, Gewichtung: Balance zwischen Sektoren + geografische Streuung)

JSON:
{
  "summary": "1-2 Sätze",
  "sectorGaps": ["..."],
  "regionGaps": ["..."],
  "suggestions": ["..."],
  "diversificationScore": 72
}`;

export async function findPortfolioGaps(
  ctx: PortfolioGapsContext,
  user: SessionUser
): Promise<FindPortfolioGapsResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = [
    `Portfolio-Lücken-Analyse. Gesamtwert ${ctx.totalValueBase.toFixed(2)} ${ctx.baseCurrency}, ${ctx.allTickers.length} Positionen.`,
    "",
    "=== SEKTOREN ===",
  ];
  for (const s of ctx.sectors) {
    lines.push(`${s.label}: ${s.weight.toFixed(1)}% [${s.tickers.join(", ")}]`);
  }
  lines.push("", "=== REGIONEN ===");
  for (const r of ctx.regions) {
    lines.push(`${r.label}: ${r.weight.toFixed(1)}% [${r.tickers.join(", ")}]`);
  }
  lines.push("", "Antwort als JSON.");

  const result = await client.call({
    system: PORTFOLIO_GAPS_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 1500,
  });

  await logUsage(result, user._id, "portfolio-gaps");
  return parseJsonResponse<FindPortfolioGapsResult>(result.text || "");
}

// ============================================================
// Macro-Szenario auf Portfolio
// ============================================================

export interface MacroScenarioPosition {
  ticker: string;
  name: string;
  weight: number;
  marketValue: number;
  currency: string;
  sector?: string;
  country?: string;
}

export interface MacroPositionImpact {
  ticker: string;
  expectedImpactPct: number;
  severity: "low" | "medium" | "high";
  direction: "up" | "down" | "neutral";
  reasoning: string;
}

export interface MacroScenarioResult {
  scenarioSummary: string;
  portfolioImpactPct: number;
  riskAssessment: "LOW" | "MEDIUM" | "HIGH";
  keyDrivers: string[];
  mostExposed: string[];
  mostInsulated: string[];
  positions: MacroPositionImpact[];
  hedges: string[];
}

const MACRO_SCENARIO_SYSTEM_PROMPT = `Du bist ein Makro-Stratege. Du bewertest, wie ein vom User beschriebenes Makro-Szenario sich auf jede einzelne Portfolio-Position auswirkt — und auf das Gesamtportfolio.

REGELN:
- Antworte IMMER auf Deutsch
- Pro Position eine erwartete Performance-Schätzung in % (expectedImpactPct), Severity (low/medium/high) und Direction (up/down/neutral) sowie 1-2 Sätze Begründung, die direkt am Szenario hängen
- Berücksichtige Sektor, Land/FX-Exposure, Geschäftsmodell
- portfolioImpactPct = gewichtetes Mittel der einzelnen expectedImpactPct
- Hedges: konkrete Instrumente/Sektoren/Tickers, die das Portfolio-Risiko in diesem Szenario senken
- Keine Anlageberatung, keine Floskeln`;

export async function analyzeMacroScenario(
  scenario: string,
  positions: MacroScenarioPosition[],
  baseCurrency: string,
  user: SessionUser,
  options: { macroBlock?: string } = {}
): Promise<MacroScenarioResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = [
    "=== SZENARIO ===",
    scenario.trim(),
  ];
  if (options.macroBlock && options.macroBlock.trim()) {
    lines.push("", options.macroBlock.trim());
  }
  lines.push("", `=== PORTFOLIO (Basis: ${baseCurrency}) ===`);
  for (const p of positions) {
    const meta = [p.sector, p.country].filter(Boolean).join(" / ");
    lines.push(
      `${p.ticker} (${p.name})${meta ? ` [${meta}]` : ""}: ${p.weight.toFixed(1)}% Gewicht, ${p.marketValue.toFixed(0)} ${baseCurrency}, handelt in ${p.currency}`
    );
  }
  lines.push(
    "",
    "Bewerte jede Position einzeln und gib das Gesamtbild. Nutze die aktuellen Makro-Indikatoren (falls oben angegeben) als Anker für deine Schätzungen."
  );

  const tool: AIToolSchema = {
    name: "macro_scenario_impact",
    description:
      "Schätze die Auswirkung des Szenarios auf jede Portfolio-Position und das Gesamtportfolio.",
    input_schema: {
      type: "object",
      required: [
        "scenarioSummary",
        "portfolioImpactPct",
        "riskAssessment",
        "keyDrivers",
        "mostExposed",
        "mostInsulated",
        "positions",
        "hedges",
      ],
      properties: {
        scenarioSummary: {
          type: "string",
          description: "Kurze Zusammenfassung des Szenarios in eigenen Worten (1-2 Sätze).",
        },
        portfolioImpactPct: {
          type: "number",
          description:
            "Erwartete Gesamt-Performance des Portfolios in % unter diesem Szenario.",
        },
        riskAssessment: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        keyDrivers: { type: "array", items: { type: "string" } },
        mostExposed: {
          type: "array",
          items: { type: "string" },
          description: "Tickers, die am stärksten leiden.",
        },
        mostInsulated: {
          type: "array",
          items: { type: "string" },
          description: "Tickers, die am stabilsten bleiben oder profitieren.",
        },
        positions: {
          type: "array",
          items: {
            type: "object",
            required: ["ticker", "expectedImpactPct", "severity", "direction", "reasoning"],
            properties: {
              ticker: { type: "string" },
              expectedImpactPct: { type: "number" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              direction: { type: "string", enum: ["up", "down", "neutral"] },
              reasoning: { type: "string" },
            },
          },
        },
        hedges: { type: "array", items: { type: "string" } },
      },
    },
  };

  const result = await client.call({
    system: MACRO_SCENARIO_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    tool,
    maxTokens: 3000,
  });
  await logUsage(result, user._id, "macro-scenario");
  if (!result.toolInput) throw new Error("KI lieferte kein Tool-Ergebnis");
  return result.toolInput as MacroScenarioResult;
}

// ============================================================
// Follow-up / Vertiefen
// ============================================================

export interface FollowUpContext {
  /** Roher Original-Analyse-Text (summary + reasoning + risks). */
  originalSummary: string;
  /** Was der User vertiefen möchte (Bullet-Text oder freie Frage). */
  topic: string;
  /** Optional: Ticker, falls die Original-Analyse einer Aktie gilt. */
  ticker?: string;
}

export interface FollowUpResult {
  reply: string;
}

const FOLLOWUP_SYSTEM_PROMPT = `Du beantwortest eine Vertiefungs-Frage zu einer bereits durchgeführten Analyse. Bezieh dich klar auf die Original-Analyse, ergänze nur Aspekte die der User explizit angefragt hat. Antworte fokussiert in 4-8 Sätzen, deutsch, ohne Markdown-Headers.`;

export async function analyzeFollowUp(
  ctx: FollowUpContext,
  user: SessionUser
): Promise<FollowUpResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const userPrompt = [
    ctx.ticker ? `Original-Analyse zu ${ctx.ticker}:` : "Original-Analyse:",
    ctx.originalSummary,
    "",
    "Vertiefungs-Frage:",
    ctx.topic,
  ].join("\n");

  const result = await client.call({
    system: FOLLOWUP_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 800,
  });
  await logUsage(result, user._id, "followup");
  return { reply: result.text?.trim() || "" };
}

// ============================================================
// Ask-the-Portfolio Chat
// ============================================================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskPortfolioResult {
  reply: string;
  model: string;
  provider: string;
}

const CHAT_SYSTEM_PROMPT_PREFIX = `Du bist der Portfolio-Co-Pilot des Users. Du siehst seinen aktuellen Kontext (Positionen, Bewertungen, Transaktionen, Dividenden, Ziele) und beantwortest Fragen dazu.

REGELN:
- Deutsch
- Antworten kurz und konkret, an die Portfolio-Daten gebunden
- Wenn die Frage außerhalb der Daten liegt: kurz sagen, dass dir der Kontext fehlt
- Keine Anlageberatung — Hinweise als Einschätzung formulieren
- Keine Markdown-Headers, Fließtext oder kurze Listen`;

export async function askPortfolio(
  context: string,
  messages: ChatMessage[],
  user: SessionUser
): Promise<AskPortfolioResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const historyLines: string[] = [];
  for (const m of messages.slice(0, -1)) {
    historyLines.push(`${m.role === "user" ? "User" : "Assistent"}: ${m.content}`);
  }
  const last = messages[messages.length - 1];

  const userPrompt = [
    "=== PORTFOLIO-KONTEXT ===",
    context,
    "",
    historyLines.length > 0 ? "=== BISHERIGER CHAT ===" : "",
    ...historyLines,
    "",
    "=== AKTUELLE FRAGE ===",
    last.content,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await client.call({
    system: CHAT_SYSTEM_PROMPT_PREFIX,
    userPrompt,
    maxTokens: 1500,
  });

  await logUsage(result, user._id, "portfolio-chat");
  return {
    reply: result.text || "",
    model: result.model,
    provider: cfg.provider,
  };
}

/**
 * Streaming-Variante: yieldet sukzessive Text-Deltas und am Ende einen
 * `meta`-Chunk mit Provider/Model. Usage wird intern geloggt — der Caller
 * muss sich darum nicht kümmern.
 */
export async function* streamAskPortfolio(
  context: string,
  messages: ChatMessage[],
  user: SessionUser
): AsyncGenerator<
  { type: "text"; delta: string } | { type: "meta"; model: string; provider: string },
  void,
  void
> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  if (!client.streamText) {
    // Provider unterstützt kein Streaming — Fallback: ein einziger Chunk.
    const result = await askPortfolio(context, messages, user);
    yield { type: "text", delta: result.reply };
    yield { type: "meta", model: result.model, provider: result.provider };
    return;
  }

  const historyLines: string[] = [];
  for (const m of messages.slice(0, -1)) {
    historyLines.push(`${m.role === "user" ? "User" : "Assistent"}: ${m.content}`);
  }
  const last = messages[messages.length - 1];
  const userPrompt = [
    "=== PORTFOLIO-KONTEXT ===",
    context,
    "",
    historyLines.length > 0 ? "=== BISHERIGER CHAT ===" : "",
    ...historyLines,
    "",
    "=== AKTUELLE FRAGE ===",
    last.content,
  ]
    .filter(Boolean)
    .join("\n");

  let finalUsage: Extract<AIStreamChunk, { type: "done" }>["usage"] | null = null;

  for await (const chunk of client.streamText({
    system: CHAT_SYSTEM_PROMPT_PREFIX,
    userPrompt,
    maxTokens: 1500,
  })) {
    if (chunk.type === "text") {
      yield { type: "text", delta: chunk.delta };
    } else if (chunk.type === "done") {
      finalUsage = chunk.usage;
    }
  }

  if (finalUsage) {
    await logClaudeUsage({
      userId: user._id,
      operation: "portfolio-chat",
      model: finalUsage.model,
      inputTokens: finalUsage.inputTokens,
      outputTokens: finalUsage.outputTokens,
      cacheCreationTokens: finalUsage.cacheCreationTokens,
      cacheReadTokens: finalUsage.cacheReadTokens,
      success: true,
    });
  }

  yield {
    type: "meta",
    model: finalUsage?.model || cfg.model,
    provider: cfg.provider,
  };
}

// ============================================================
// Magazine PDF Analysis
// ============================================================

export interface MagazineAnalysisContext {
  document: { base64: string; mimeType: string; filename?: string };
  userHint?: string;
}

export interface MagazineRecommendation {
  ticker?: string;
  name: string;
  recommendation: "BUY" | "HOLD" | "SELL" | "ACCUMULATE" | "REDUCE" | "WATCH";
  priceTarget?: { value: number; currency: string } | null;
  stopLoss?: { value: number; currency: string } | null;
  horizon?: "kurz" | "mittel" | "lang" | null;
  rationale: string;
  pageReference?: string | null;
  risks?: string[];
}

export interface MagazineAnalysisResult {
  magazineTitle: string;
  issueNumber?: string | null;
  issueDate?: string | null;
  summary: string;
  coverTopics: string[];
  marketOutlook?: string | null;
  recommendations: MagazineRecommendation[];
}

const MAGAZINE_SYSTEM_PROMPT = `Du bist ein Finanz-Analyst. Du bekommst ein PDF einer Börsenzeitschrift (z.B. "Börse Online", "Der Aktionär", "Focus Money") und sollst alle konkreten Aktien-Empfehlungen daraus extrahieren.

REGELN:
- Deutsch
- NUR konkrete, im PDF genannte Empfehlungen extrahieren — keine allgemeinen Artikel-Erwähnungen ohne Empfehlungscharakter
- ticker im Yahoo-Finance-Format (SAP.DE, AAPL, NESN.SW, ASML.AS). Wenn unsicher: weglassen.
- recommendation: BUY (Kauf/Nachkauf), HOLD (Halten), SELL (Verkauf), ACCUMULATE (Zukaufen/Aufstocken), REDUCE (Reduzieren/Teilverkauf), WATCH (Beobachten)
- priceTarget/stopLoss: nur wenn im Artikel konkret genannt — sonst null
- horizon: "kurz" (< 3 Monate), "mittel" (3-12 Monate), "lang" (> 1 Jahr), sonst null
- rationale: 1-3 Sätze aus dem Artikel, warum die Empfehlung
- pageReference: Seitenzahl oder Rubrik aus dem PDF (falls erkennbar), sonst null
- risks: maximal 3 knappe Risiko-Punkte aus dem Artikel
- magazineTitle + issueNumber + issueDate aus dem PDF ablesen
- Keine Halluzinationen — wenn die Information nicht im PDF steht: null / weglassen

Antworte AUSSCHLIESSLICH in JSON:
{
  "magazineTitle": "Börse Online",
  "issueNumber": "42/2026",
  "issueDate": "2026-10-15",
  "summary": "2-4 Sätze Zusammenfassung der Ausgabe",
  "coverTopics": ["Titelthema 1", "Titelthema 2"],
  "marketOutlook": "Markt-Einschätzung aus dem Heft, falls vorhanden",
  "recommendations": [
    {
      "ticker": "SAP.DE",
      "name": "SAP",
      "recommendation": "BUY",
      "priceTarget": { "value": 210, "currency": "EUR" },
      "stopLoss": { "value": 175, "currency": "EUR" },
      "horizon": "mittel",
      "rationale": "Cloud-Transition liefert überraschende Margenausweitung...",
      "pageReference": "S. 14",
      "risks": ["..."]
    }
  ]
}`;

export async function analyzeMagazine(
  ctx: MagazineAnalysisContext,
  user: SessionUser,
  // Per-Call-Override aus dem Magazin-UI. Überspringt den Settings-Resolver
  // und Shared-Key-Pfade.
  overrideConfig?: AIConfig
): Promise<{ result: MagazineAnalysisResult; usedConfig: AIConfig }> {
  const cfg = overrideConfig ?? (await resolveConfig(user));
  const client = getAIClient(cfg);

  const prompt = [
    "Extrahiere alle Aktien-Empfehlungen aus diesem PDF einer Börsenzeitschrift.",
    ctx.userHint ? `\nHinweis vom User: ${ctx.userHint}` : "",
    "\nAntwort AUSSCHLIESSLICH als JSON gemäß dem Schema im System-Prompt.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await client.call({
    system: MAGAZINE_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: 6000,
    document: ctx.document,
  });

  await logUsage(result, user._id, "magazine-analysis");
  return {
    result: parseJsonResponse<MagazineAnalysisResult>(result.text || ""),
    usedConfig: cfg,
  };
}

// ============================================================
// Portfolio News Digest
// ============================================================

export interface NewsDigestTickerInput {
  ticker: string;
  name: string;
  currency: string;
  priceChangePct?: number;
  news: Array<{ title: string; publisher: string; publishedAt: string }>;
  upcomingEarningsDate?: string;
}

export interface NewsDigestContext {
  periodDays: number;
  positions: NewsDigestTickerInput[];
}

export interface NewsDigestTickerResult {
  ticker: string;
  name?: string;
  relevance: number;
  impact: "positive" | "negative" | "neutral";
  summary: string;
  keyFacts: string[];
  priceChangePct?: number;
}

export interface NewsDigestResult {
  headline: string;
  summary: string;
  marketOverview: string;
  perTicker: NewsDigestTickerResult[];
  upcomingEvents: string[];
  watchNext: string[];
}

const NEWS_DIGEST_SYSTEM_PROMPT = `Du bist der persönliche Portfolio-News-Analyst des Users. Du bekommst die Positionen des Users + pro Position die News der letzten Tage + die Kursbewegung. Erstelle einen knappen, ehrlichen Digest.

REGELN:
- Deutsch
- Headline: ein Satz, worum es diese Woche wirklich ging
- summary: 2-3 Sätze Gesamtbild
- marketOverview: Was war makro, was war sektoral, was war idiosynkratisch
- perTicker: NUR Ticker mit spürbarer News-Relevanz oder spürbarer Kursbewegung (>3%). Positionen ohne News + kleine Moves weglassen.
  - relevance: 1 (kaum Bedeutung) bis 5 (marktbewegend)
  - impact: positive/negative/neutral
  - summary: 1-2 Sätze konkret aus den News (keine Spekulation)
  - keyFacts: 2-4 knallharte Fakten aus den Headlines (keine Floskeln)
- upcomingEvents: kommende Earnings-Termine, Produkt-Launches, Makro-Events falls aus News ableitbar
- watchNext: 2-4 Punkte, worauf User diese Woche achten sollte

Keine Anlageberatung, keine Kursziele — ausschließlich einordnen.

Antworte AUSSCHLIESSLICH in JSON:
{
  "headline": "...",
  "summary": "...",
  "marketOverview": "...",
  "perTicker": [
    { "ticker": "AAPL", "name": "Apple", "relevance": 4, "impact": "positive", "summary": "...", "keyFacts": ["..."], "priceChangePct": 3.2 }
  ],
  "upcomingEvents": ["..."],
  "watchNext": ["..."]
}`;

export async function analyzeNewsDigest(
  ctx: NewsDigestContext,
  user: SessionUser
): Promise<NewsDigestResult> {
  const cfg = await resolveConfig(user);
  const client = getAIClient(cfg);

  const lines: string[] = [
    `Portfolio-News-Digest der letzten ${ctx.periodDays} Tage.`,
    `${ctx.positions.length} Positionen.`,
    "",
  ];
  for (const p of ctx.positions) {
    lines.push("---");
    lines.push(
      `${p.ticker} (${p.name})${p.priceChangePct != null ? ` — ${p.priceChangePct >= 0 ? "+" : ""}${p.priceChangePct.toFixed(2)}% im Zeitraum` : ""}`
    );
    if (p.upcomingEarningsDate) {
      lines.push(`Earnings-Termin: ${p.upcomingEarningsDate.slice(0, 10)}`);
    }
    if (p.news.length === 0) {
      lines.push("(keine News im Zeitraum)");
    } else {
      for (const n of p.news.slice(0, 8)) {
        lines.push(
          `[${n.publishedAt.slice(0, 10)}] ${n.publisher}: ${n.title}`
        );
      }
    }
  }
  lines.push("", "Antworte als JSON gemäß Schema.");

  const result = await client.call({
    system: NEWS_DIGEST_SYSTEM_PROMPT,
    userPrompt: lines.join("\n"),
    maxTokens: 3500,
  });

  await logUsage(result, user._id, "news-digest");
  return parseJsonResponse<NewsDigestResult>(result.text || "");
}

export function getModelName(user?: SessionUser | null): string {
  if (!user) return "unknown";
  const cfg = buildAIConfig(user);
  return cfg ? `${cfg.provider}:${cfg.model}` : "none";
}
