import { estimateCostUSD } from "./aiPricing";
import type { AIProvider } from "./ai/types";

/**
 * Sehr grobe Token-Heuristik. Echte Tokenizer (tiktoken etc.) sind langsam und
 * groß; für eine *Vorab-Schätzung* reicht Zeichenzahl ÷ 4. Liegt für deutsche
 * Prompts mit Yahoo-Daten typischerweise innerhalb ±15 % der echten
 * Tokenization. Wir schätzen lieber leicht hoch — der User erlebt dann eine
 * günstige Überraschung statt einer teuren.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

interface EstimateInputs {
  provider: AIProvider;
  model: string;
  /** System-Prompt + User-Prompt, alles was an die KI geht. */
  promptText: string;
  /** Erwartetes Output-Volumen. Nutze die `maxTokens` der Operation. */
  expectedOutputTokens: number;
  /** Wie viele parallele Calls? (Consensus = 3, Default 1). */
  parallelCalls?: number;
}

export interface EstimateResult {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  formatted: string;
}

const NON_CLAUDE_PRICING_PER_M_USD: Partial<
  Record<string, { input: number; output: number }>
> = {
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

function fallbackPricing(provider: AIProvider): { input: number; output: number } {
  // Defaults für unbekannte Modelle — bewusst eher pessimistisch.
  if (provider === "gemini") return { input: 1.25, output: 10 };
  if (provider === "openai-compat") return { input: 2.5, output: 10 };
  if (provider === "ollama") return { input: 0, output: 0 }; // lokal, kein Marktpreis
  return { input: 3, output: 15 }; // claude sonnet als Default
}

function priceNonClaudeUSD(model: string, provider: AIProvider, input: number, output: number): number {
  const m = model.toLowerCase();
  const direct = NON_CLAUDE_PRICING_PER_M_USD[m];
  if (direct) {
    return (input * direct.input + output * direct.output) / 1_000_000;
  }
  // Heuristik per Substring
  for (const [key, p] of Object.entries(NON_CLAUDE_PRICING_PER_M_USD)) {
    if (m.includes(key) && p) {
      return (input * p.input + output * p.output) / 1_000_000;
    }
  }
  const fb = fallbackPricing(provider);
  return (input * fb.input + output * fb.output) / 1_000_000;
}

export function estimateCallCost(inputs: EstimateInputs): EstimateResult {
  const inputTokens = estimateTokens(inputs.promptText);
  const outputTokens = inputs.expectedOutputTokens;
  const callCost =
    inputs.provider === "claude"
      ? estimateCostUSD(inputs.model, inputTokens, outputTokens)
      : inputs.provider === "ollama"
        ? 0
        : priceNonClaudeUSD(inputs.model, inputs.provider, inputTokens, outputTokens);
  const total = callCost * (inputs.parallelCalls ?? 1);
  return {
    inputTokens,
    outputTokens,
    costUsd: total,
    formatted: formatCostUsd(total),
  };
}

export function formatCostUsd(usd: number): string {
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
