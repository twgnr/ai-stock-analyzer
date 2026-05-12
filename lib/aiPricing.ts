/**
 * Pricing-Tabelle für KI-Modelle. Bewusst frei von Server-Imports
 * (kein Mongoose, kein Node-only-Code), damit auch Client-Components
 * (z. B. <EstimatedCostBadge>) sie nutzen können, ohne die Mongo-Kette
 * in den Browser-Bundle zu ziehen.
 */

export interface PricingRow {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

export const PRICING_PER_MILLION_USD: Record<string, PricingRow> = {
  "claude-opus-4-7": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export function findPricing(model: string): PricingRow {
  const base = model.replace(/\[.*\]$/, "").trim();
  if (PRICING_PER_MILLION_USD[base]) return PRICING_PER_MILLION_USD[base];
  if (base.includes("opus")) return PRICING_PER_MILLION_USD["claude-opus-4-7"];
  if (base.includes("haiku")) return PRICING_PER_MILLION_USD["claude-haiku-4-5"];
  return PRICING_PER_MILLION_USD["claude-sonnet-4-6"];
}

export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
): number {
  const p = findPricing(model);
  const input = (inputTokens * p.input) / 1_000_000;
  const output = (outputTokens * p.output) / 1_000_000;
  const cacheW =
    cacheCreationTokens > 0 && p.cacheWrite
      ? (cacheCreationTokens * p.cacheWrite) / 1_000_000
      : 0;
  const cacheR =
    cacheReadTokens > 0 && p.cacheRead
      ? (cacheReadTokens * p.cacheRead) / 1_000_000
      : 0;
  return input + output + cacheW + cacheR;
}
