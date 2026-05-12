import type { AIClient, AIConfig, AIProvider } from "./types";
import { DEFAULT_MODELS } from "./types";
import { ClaudeClient } from "./claudeClient";
import { GeminiClient } from "./geminiClient";
import { OpenAICompatClient } from "./openaiClient";
import { getAppSettings } from "../models/AppSettings";
import { getUserCostWindows } from "../usage";
import { decryptSecret } from "../secretCrypto";
import type { Types } from "mongoose";

export function getAIClient(config: AIConfig): AIClient {
  switch (config.provider) {
    case "claude":
      return new ClaudeClient(config);
    case "gemini":
      return new GeminiClient(config);
    case "openai-compat":
      return new OpenAICompatClient(config);
    case "ollama":
      // Ollama exponiert `/v1/chat/completions` OpenAI-kompatibel. Es verlangt
      // standardmäßig keinen API-Key, der OpenAI-SDK akzeptiert aber kein
      // leeres Feld — `"ollama"` ist die offizielle Empfehlung als Dummy-Key.
      return new OpenAICompatClient({
        ...config,
        apiKey: config.apiKey || "ollama",
      });
    default:
      throw new Error(`Unbekannter Provider: ${(config as AIConfig).provider}`);
  }
}

export interface UserAISettings {
  aiProvider?: AIProvider;
  aiProviderOrder?: AIProvider[];
  disabledAiProviders?: AIProvider[];
  claudeApiKey?: string;
  claudeModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  // Ollama: kein API-Key, `ollamaBaseUrl` ist das Konfigurations-Signal.
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  aiDisabled?: boolean;
}

const ALL_PROVIDERS: AIProvider[] = [
  "claude",
  "gemini",
  "openai-compat",
  "ollama",
];

// User-Order zuerst, dann die restlichen Provider in kanonischer Reihenfolge,
// damit ein nicht gelisteter Provider nicht verschwindet.
function resolveProviderOrder(user: UserAISettings): AIProvider[] {
  const seen = new Set<string>();
  const out: AIProvider[] = [];
  const explicit = user.aiProviderOrder;
  if (Array.isArray(explicit) && explicit.length) {
    for (const p of explicit) {
      if (!seen.has(p) && ALL_PROVIDERS.includes(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  } else if (user.aiProvider) {
    seen.add(user.aiProvider);
    out.push(user.aiProvider);
  }
  for (const p of ALL_PROVIDERS) {
    if (!seen.has(p)) out.push(p);
  }
  return out;
}

function isDisabled(user: UserAISettings, provider: AIProvider): boolean {
  return (user.disabledAiProviders || []).includes(provider);
}

export function buildAIConfig(user: UserAISettings): AIConfig | null {
  for (const provider of resolveProviderOrder(user)) {
    if (isDisabled(user, provider)) continue;
    const cfg = buildAIConfigForProvider(user, provider);
    if (cfg) return cfg;
  }
  return null;
}

export function hasAIKey(user: UserAISettings): boolean {
  return buildAIConfig(user) !== null;
}

// Per-Call-Override: AIConfig für genau einen vom Aufrufer gewählten Provider,
// unabhängig von `user.aiProvider`. Greift nicht auf den Shared-Admin-Key zu.
export function buildAIConfigForProvider(
  user: UserAISettings,
  provider: AIProvider
): AIConfig | null {
  if (provider === "claude" && user.claudeApiKey) {
    return {
      provider: "claude",
      apiKey: user.claudeApiKey,
      model: user.claudeModel || DEFAULT_MODELS.claude,
    };
  }
  if (provider === "gemini" && user.geminiApiKey) {
    return {
      provider: "gemini",
      apiKey: user.geminiApiKey,
      model: user.geminiModel || DEFAULT_MODELS.gemini,
    };
  }
  if (provider === "openai-compat" && user.openaiApiKey) {
    return {
      provider: "openai-compat",
      apiKey: user.openaiApiKey,
      baseUrl: user.openaiBaseUrl,
      model: user.openaiModel || DEFAULT_MODELS["openai-compat"],
    };
  }
  if (provider === "ollama" && user.ollamaBaseUrl) {
    return {
      provider: "ollama",
      // Ollama hat per Default keine Auth — Key bleibt leer, der getAIClient
      // setzt einen Dummy ein, falls nötig.
      apiKey: "",
      baseUrl: user.ollamaBaseUrl,
      model: user.ollamaModel || DEFAULT_MODELS.ollama,
    };
  }
  return null;
}

// Konfigurierte Provider des Users in dessen Sortierreihenfolge.
export function listUserProviders(
  user: UserAISettings
): Array<{
  provider: AIProvider;
  model: string;
  disabled: boolean;
}> {
  const out: Array<{
    provider: AIProvider;
    model: string;
    disabled: boolean;
  }> = [];
  for (const provider of resolveProviderOrder(user)) {
    const cfg = buildAIConfigForProvider(user, provider);
    if (!cfg) continue;
    out.push({
      provider,
      model: cfg.model,
      disabled: isDisabled(user, provider),
    });
  }
  return out;
}

// ============================================================
// Admin-Shared-Key + Limit-Check
// ============================================================

export interface ResolvedAIConfig {
  config: AIConfig;
  /** Herkunft — wichtig fürs UI, damit der User weiß welchen Key er gerade nutzt */
  source: "user" | "shared";
}

export interface AIResolutionFailure {
  reason:
    | "no-user-key-no-shared"
    | "shared-disabled"
    | "shared-paused"
    | "user-disabled"
    | "daily-limit-exceeded"
    | "monthly-limit-exceeded";
  message: string;
  limits?: {
    dayUsd: number;
    monthUsd: number;
    dailyLimitUsd: number;
    monthlyLimitUsd: number;
  };
}

function buildAdminConfig(
  aiSettings: NonNullable<
    Awaited<ReturnType<typeof getAppSettings>>["ai"]
  >,
  preferredProvider: AIProvider = "claude"
): AIConfig | null {
  // Admin-Keys werden at rest verschlüsselt. Vor Nutzung einmalig entschlüsseln.
  // Ollama wird hier bewusst NICHT unterstützt — ein lokaler LLM-Server ist
  // pro User-Maschine, nicht admin-zentral teilbar.
  const claudeKey = decryptSecret(aiSettings.claudeApiKey);
  const geminiKey = decryptSecret(aiSettings.geminiApiKey);
  const openaiKey = decryptSecret(aiSettings.openaiApiKey);

  if (preferredProvider === "claude" && claudeKey) {
    return {
      provider: "claude",
      apiKey: claudeKey,
      model: aiSettings.claudeModel || DEFAULT_MODELS.claude,
    };
  }
  if (preferredProvider === "gemini" && geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: aiSettings.geminiModel || DEFAULT_MODELS.gemini,
    };
  }
  if (preferredProvider === "openai-compat" && openaiKey) {
    return {
      provider: "openai-compat",
      apiKey: openaiKey,
      baseUrl: aiSettings.openaiBaseUrl,
      model: aiSettings.openaiModel || DEFAULT_MODELS["openai-compat"],
    };
  }
  // Fallback: den ersten Admin-Key nutzen, wenn preferred nicht gesetzt
  if (claudeKey) {
    return {
      provider: "claude",
      apiKey: claudeKey,
      model: aiSettings.claudeModel || DEFAULT_MODELS.claude,
    };
  }
  if (geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: aiSettings.geminiModel || DEFAULT_MODELS.gemini,
    };
  }
  if (openaiKey) {
    return {
      provider: "openai-compat",
      apiKey: openaiKey,
      baseUrl: aiSettings.openaiBaseUrl,
      model: aiSettings.openaiModel || DEFAULT_MODELS["openai-compat"],
    };
  }
  return null;
}

/**
 * Haupt-Resolver: User-Key bevorzugt; sonst Admin-Fallback mit Limit-Check.
 * Bei Limit-Überschreitung wird ein Failure-Objekt zurückgegeben, das die
 * Fehlermeldung UI-tauglich transportiert.
 */
export async function resolveAIConfig(
  user: UserAISettings,
  userId: Types.ObjectId | string
): Promise<
  { ok: true; config: AIConfig; source: "user" | "shared" }
  | { ok: false; failure: AIResolutionFailure }
> {
  // 0) User hat seine eigene KI-Nutzung pausiert → keine Anfrage, egal ob er
  // einen Key hat oder nicht.
  if (user.aiDisabled) {
    return {
      ok: false,
      failure: {
        reason: "user-disabled",
        message:
          "Du hast deine KI-Nutzung in den Einstellungen pausiert. Aktiviere sie dort wieder, um KI-Funktionen zu nutzen.",
      },
    };
  }

  // 1) User hat eigenen Key → immer dessen verwenden, keine Limits
  const userCfg = buildAIConfig(user);
  if (userCfg) return { ok: true, config: userCfg, source: "user" };

  // 2) Shared-Key-Pfad (kein Ollama — siehe buildAdminConfig)
  const settings = await getAppSettings();
  const ai = settings.ai;
  // Ein User mit primärem Provider „ollama" aber ohne ollamaBaseUrl darf nicht
  // den Admin-Ollama-Key bekommen (gibt's nicht); deshalb fallback auf claude
  // als preferredProvider, falls aiProvider „ollama" ist.
  const adminPreferred: AIProvider =
    user.aiProvider === "ollama" ? "claude" : (user.aiProvider || "claude");
  const adminCfg = ai ? buildAdminConfig(ai, adminPreferred) : null;
  if (!ai || !adminCfg) {
    return {
      ok: false,
      failure: {
        reason: "no-user-key-no-shared",
        message:
          "Kein eigener KI-API-Key hinterlegt und der Admin hat keinen Shared-Key konfiguriert.",
      },
    };
  }
  if (ai.sharedKeyPaused) {
    return {
      ok: false,
      failure: {
        reason: "shared-paused",
        message:
          "Der Administrator hat den gemeinsamen KI-Key vorübergehend pausiert. Bitte hinterlege einen eigenen Key oder versuche es später.",
      },
    };
  }
  if (!ai.allowSharedKeyUsage) {
    return {
      ok: false,
      failure: {
        reason: "shared-disabled",
        message:
          "Kein eigener KI-API-Key hinterlegt. Admin erlaubt die gemeinsame Nutzung seines Keys nicht — bitte eigenen Key in den Einstellungen hinterlegen.",
      },
    };
  }

  // 3) Limit-Check (nur wenn > 0 gesetzt)
  const daily = ai.dailyCostLimitUsd ?? 0;
  const monthly = ai.monthlyCostLimitUsd ?? 0;
  if (daily > 0 || monthly > 0) {
    const usage = await getUserCostWindows(userId);
    if (daily > 0 && usage.dayUsd >= daily) {
      return {
        ok: false,
        failure: {
          reason: "daily-limit-exceeded",
          message: `Tageslimit (${daily.toFixed(2)} USD) für den Shared-KI-Key erreicht. Bitte eigenen Key hinterlegen oder morgen erneut.`,
          limits: {
            dayUsd: usage.dayUsd,
            monthUsd: usage.monthUsd,
            dailyLimitUsd: daily,
            monthlyLimitUsd: monthly,
          },
        },
      };
    }
    if (monthly > 0 && usage.monthUsd >= monthly) {
      return {
        ok: false,
        failure: {
          reason: "monthly-limit-exceeded",
          message: `Monatslimit (${monthly.toFixed(2)} USD) für den Shared-KI-Key erreicht. Bitte eigenen Key in den Einstellungen hinterlegen.`,
          limits: {
            dayUsd: usage.dayUsd,
            monthUsd: usage.monthUsd,
            dailyLimitUsd: daily,
            monthlyLimitUsd: monthly,
          },
        },
      };
    }
  }

  return { ok: true, config: adminCfg, source: "shared" };
}

/**
 * „Hat der User irgendeine KI-Option?" — true wenn eigener Key ODER
 * Shared-Key zulässig (und Limit nicht erschöpft).
 */
export async function hasAnyAIAccess(
  user: UserAISettings,
  userId: Types.ObjectId | string
): Promise<boolean> {
  const r = await resolveAIConfig(user, userId);
  return r.ok;
}

export function getConfiguredProviders(user: UserAISettings): AIConfig[] {
  const configs: AIConfig[] = [];
  if (user.claudeApiKey) {
    configs.push({
      provider: "claude",
      apiKey: user.claudeApiKey,
      model: user.claudeModel || DEFAULT_MODELS.claude,
    });
  }
  if (user.geminiApiKey) {
    configs.push({
      provider: "gemini",
      apiKey: user.geminiApiKey,
      model: user.geminiModel || DEFAULT_MODELS.gemini,
    });
  }
  if (user.openaiApiKey) {
    configs.push({
      provider: "openai-compat",
      apiKey: user.openaiApiKey,
      baseUrl: user.openaiBaseUrl,
      model: user.openaiModel || DEFAULT_MODELS["openai-compat"],
    });
  }
  if (user.ollamaBaseUrl) {
    configs.push({
      provider: "ollama",
      apiKey: "",
      baseUrl: user.ollamaBaseUrl,
      model: user.ollamaModel || DEFAULT_MODELS.ollama,
    });
  }
  return configs;
}
