export type AIProvider = "claude" | "gemini" | "openai-compat" | "ollama";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface AIToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AIImageInput {
  base64: string;
  mimeType: string;
}

export interface AIDocumentInput {
  base64: string;
  mimeType: string;
  filename?: string;
}

export interface AICallOptions {
  system?: string;
  userPrompt: string;
  maxTokens?: number;
  tool?: AIToolSchema;
  image?: AIImageInput;
  document?: AIDocumentInput;
  /**
   * Wenn `true` (Default), darf der Provider System-Prompt und ggf. weitere
   * stabile Blöcke cachen. Anthropic: `cache_control: ephemeral`. Andere
   * Provider ignorieren das Feld stillschweigend.
   */
  cacheable?: boolean;
}

export interface AIResult {
  text?: string;
  toolInput?: unknown;
  inputTokens: number;
  outputTokens: number;
  /** Tokens, die in den Provider-Cache geschrieben wurden (Anthropic). */
  cacheCreationTokens?: number;
  /** Tokens, die aus dem Provider-Cache gelesen wurden (Anthropic, billiger). */
  cacheReadTokens?: number;
  model: string;
}

/**
 * Stream-Events. Erst kommen 0..n `text`-Chunks, ganz am Ende genau ein
 * `done`-Event mit der Token-Usage. Bei Fehler wird stattdessen ein
 * `error`-Event geworfen oder der Generator throwt (Caller fängt beides ab).
 */
export type AIStreamChunk =
  | { type: "text"; delta: string }
  | {
      type: "done";
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
        model: string;
      };
    };

export interface AIClient {
  call(options: AICallOptions): Promise<AIResult>;
  /**
   * Optionaler Streaming-Pfad. Wenn der Provider nicht streamt, ist das Feld
   * `undefined` und der Caller fällt auf `call()` zurück.
   */
  streamText?(options: AICallOptions): AsyncGenerator<AIStreamChunk, void, void>;
  describeModel(): string;
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash",
  "openai-compat": "gpt-4o-mini",
  ollama: "llama3.1:8b",
};

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  "openai-compat": "OpenAI-kompatibel (OpenAI, Groq, OpenRouter, …)",
  ollama: "Ollama (lokal)",
};
