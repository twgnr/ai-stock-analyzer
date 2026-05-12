"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Save,
  CheckCircle2,
  Cpu,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Power,
  PowerOff,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Provider = "claude" | "gemini" | "openai-compat" | "ollama";

const ALL_PROVIDERS: Provider[] = ["claude", "gemini", "openai-compat", "ollama"];

interface Settings {
  aiProvider: Provider;
  aiProviderOrder: Provider[];
  disabledAiProviders: Provider[];
  claudeApiKey: boolean;
  claudeApiKeyPreview: string | null;
  claudeModel: string;
  geminiApiKey: boolean;
  geminiApiKeyPreview: string | null;
  geminiModel: string;
  openaiApiKey: boolean;
  openaiApiKeyPreview: string | null;
  openaiBaseUrl: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaConfigured: boolean;
}

interface OllamaTestModel {
  name: string;
  sizeMb: number | null;
}

interface Props {
  initial: Settings;
  onSaved: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

// Help-URLs sind statisch — Labels werden via i18n geliefert.
const PROVIDER_HELP: Record<Provider, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  "openai-compat": "https://console.groq.com/keys",
  ollama: "https://ollama.com/download",
};

function configuredProvidersOf(s: Settings): Provider[] {
  const has: Record<Provider, boolean> = {
    claude: !!s.claudeApiKey,
    gemini: !!s.geminiApiKey,
    "openai-compat": !!s.openaiApiKey,
    // Ollama gilt als „konfiguriert", sobald eine Base-URL gesetzt ist —
    // einen API-Key gibt's hier nicht.
    ollama: !!s.ollamaConfigured,
  };
  return ALL_PROVIDERS.filter((p) => has[p]);
}

function deriveOrder(s: Settings): Provider[] {
  const configured = configuredProvidersOf(s);
  const seen = new Set<Provider>();
  const out: Provider[] = [];
  for (const p of s.aiProviderOrder || []) {
    if (configured.includes(p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const p of configured) {
    if (!seen.has(p)) out.push(p);
  }
  return out;
}

export function AiProviderSettings({ initial, onSaved, onError, onSuccess }: Props) {
  const t = useTranslations("Settings.aiProvider");
  const tCommon = useTranslations("Settings.common");

  const PROVIDER_INFO: Record<
    Provider,
    {
      label: string;
      description: string;
      helpUrl: string;
      helpLabel: string;
      badge?: string;
    }
  > = useMemo(
    () => ({
      claude: {
        label: t("providers.claude.label"),
        description: t("providers.claude.description"),
        helpUrl: PROVIDER_HELP.claude,
        helpLabel: t("providers.claude.helpLabel"),
      },
      gemini: {
        label: t("providers.gemini.label"),
        description: t("providers.gemini.description"),
        helpUrl: PROVIDER_HELP.gemini,
        helpLabel: t("providers.gemini.helpLabel"),
        badge: t("providers.gemini.badge"),
      },
      "openai-compat": {
        label: t("providers.openai-compat.label"),
        description: t("providers.openai-compat.description"),
        helpUrl: PROVIDER_HELP["openai-compat"],
        helpLabel: t("providers.openai-compat.helpLabel"),
        badge: t("providers.openai-compat.badge"),
      },
      ollama: {
        label: t("providers.ollama.label"),
        description: t("providers.ollama.description"),
        helpUrl: PROVIDER_HELP.ollama,
        helpLabel: t("providers.ollama.helpLabel"),
        badge: t("providers.ollama.badge"),
      },
    }),
    [t]
  );

  const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = useMemo(
    () => ({
      claude: [
        { value: "claude-sonnet-4-6", label: t("modelPresets.claude.sonnet46") },
        { value: "claude-opus-4-7", label: t("modelPresets.claude.opus47") },
        { value: "claude-haiku-4-5", label: t("modelPresets.claude.haiku45") },
      ],
      gemini: [
        { value: "gemini-2.0-flash", label: t("modelPresets.gemini.flash20") },
        { value: "gemini-2.0-flash-exp", label: t("modelPresets.gemini.flash20Exp") },
        { value: "gemini-1.5-pro", label: t("modelPresets.gemini.pro15") },
        { value: "gemini-1.5-flash", label: t("modelPresets.gemini.flash15") },
      ],
      "openai-compat": [
        { value: "gpt-4o-mini", label: t("modelPresets.openaiCompat.gpt4oMini") },
        { value: "gpt-4o", label: t("modelPresets.openaiCompat.gpt4o") },
        { value: "llama-3.3-70b-versatile", label: t("modelPresets.openaiCompat.llama70b") },
        { value: "llama-3.1-8b-instant", label: t("modelPresets.openaiCompat.llama8b") },
        { value: "deepseek-chat", label: t("modelPresets.openaiCompat.deepseek") },
      ],
      ollama: [
        { value: "llama3.1:8b", label: t("modelPresets.ollama.llama8b") },
        { value: "qwen2.5:14b", label: t("modelPresets.ollama.qwen14b") },
        { value: "qwen2.5:7b", label: t("modelPresets.ollama.qwen7b") },
        { value: "mistral-nemo", label: t("modelPresets.ollama.mistralNemo") },
        { value: "llama3.2:3b", label: t("modelPresets.ollama.llama3b") },
        { value: "llama3.2-vision:11b", label: t("modelPresets.ollama.llamaVision") },
      ],
    }),
    [t]
  );

  const OLLAMA_BASE_URL_PRESETS: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: "http://localhost:11434/v1", label: t("ollamaPresets.localhost") },
      {
        value: "http://host.docker.internal:11434/v1",
        label: t("ollamaPresets.docker"),
      },
    ],
    [t]
  );

  const BASE_URL_PRESETS: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: "", label: t("baseUrlPresets.default") },
      { value: "https://api.groq.com/openai/v1", label: t("baseUrlPresets.groq") },
      { value: "https://openrouter.ai/api/v1", label: t("baseUrlPresets.openrouter") },
      { value: "https://api.together.xyz/v1", label: t("baseUrlPresets.together") },
      { value: "https://api.deepseek.com/v1", label: t("baseUrlPresets.deepseek") },
    ],
    [t]
  );

  const [provider, setProvider] = useState<Provider>(initial.aiProvider);
  const [claudeKey, setClaudeKey] = useState("");
  const [claudeModel, setClaudeModel] = useState(initial.claudeModel || "claude-sonnet-4-6");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(initial.geminiModel || "gemini-2.0-flash");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(initial.openaiBaseUrl || "");
  const [openaiModel, setOpenaiModel] = useState(initial.openaiModel || "gpt-4o-mini");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    initial.ollamaBaseUrl || "http://localhost:11434/v1"
  );
  const [ollamaModel, setOllamaModel] = useState(initial.ollamaModel || "llama3.1:8b");
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<
    { ok: true; models: OllamaTestModel[] } | { ok: false; error: string } | null
  >(null);
  const [saving, setSaving] = useState(false);

  // Lokaler State für Reihenfolge + Disabled, persistiert beim Save-Klick.
  const [order, setOrder] = useState<Provider[]>(() => deriveOrder(initial));
  const [disabled, setDisabled] = useState<Provider[]>(
    () => initial.disabledAiProviders || []
  );

  const configured = useMemo(() => configuredProvidersOf(initial), [initial]);
  const initialOrder = useMemo(() => deriveOrder(initial), [initial]);
  const orderChanged =
    order.join(",") !== initialOrder.join(",") ||
    disabled.slice().sort().join(",") !==
      (initial.disabledAiProviders || []).slice().sort().join(",");

  async function saveProvider() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider: provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(t("activeSaved", { label: PROVIDER_INFO[provider].label }));
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  async function saveClaude() {
    await saveKey({ claudeApiKey: claudeKey, claudeModel });
    setClaudeKey("");
  }
  async function saveGemini() {
    await saveKey({ geminiApiKey: geminiKey, geminiModel });
    setGeminiKey("");
  }
  async function saveOpenai() {
    await saveKey({ openaiApiKey: openaiKey, openaiBaseUrl, openaiModel });
    setOpenaiKey("");
  }

  async function saveOllama() {
    // Ollama hat keinen API-Key — wir speichern URL + Modell. Wenn die URL
    // leer ist, wird der Provider serverseitig dekonfiguriert und
    // verschwindet aus der Liste.
    await saveKey({ ollamaBaseUrl, ollamaModel });
  }

  async function testOllama() {
    setOllamaTesting(true);
    setOllamaTestResult(null);
    try {
      const params = new URLSearchParams({ baseUrl: ollamaBaseUrl });
      const res = await fetch(`/api/ai/ollama/test?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setOllamaTestResult({ ok: false, error: data.error || t("ollamaUnknownError") });
      } else {
        setOllamaTestResult({ ok: true, models: data.models || [] });
        // Wenn der eingestellte Modellname nicht in der Liste ist und Modelle
        // vorhanden sind, das erste verfügbare Modell als Vorschlag setzen.
        const names = (data.models || []).map((m: OllamaTestModel) => m.name);
        if (names.length > 0 && !names.includes(ollamaModel)) {
          setOllamaModel(names[0]);
        }
      }
    } catch (e) {
      setOllamaTestResult({
        ok: false,
        error: e instanceof Error ? e.message : t("ollamaNetworkError"),
      });
    } finally {
      setOllamaTesting(false);
    }
  }

  async function saveKey(body: Record<string, string>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(t("saved"));
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx: number) {
    setOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  function toggleDisabled(p: Provider) {
    setDisabled((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function savePriority() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProviderOrder: order,
          disabledAiProviders: disabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(t("savedPriority"));
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  const info = PROVIDER_INFO[provider];

  return (
    <>
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Cpu size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
          {t("activeProvider")}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => {
            const i = PROVIDER_INFO[p];
            return (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`p-3 rounded-md border text-left transition-colors ${
                  provider === p
                    ? "border-[var(--accent)] bg-blue-500/10"
                    : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">{i.label}</span>
                  {i.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-[var(--green)]">
                      {i.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--muted)]">{i.description}</div>
              </button>
            );
          })}
        </div>
        {provider !== initial.aiProvider && (
          <button onClick={saveProvider} disabled={saving} className="btn btn-primary mt-3">
            <Save size={14} /> {t("switchTo", { label: info.label })}
          </button>
        )}
      </div>

      <div className="pt-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium text-sm">{info.label} — {t("apiKey")}</div>
            <a
              href={info.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              {info.helpLabel} <ExternalLink size={10} />
            </a>
          </div>
        </div>

        {provider === "claude" && (
          <div className="space-y-3">
            {initial.claudeApiKey && (
              <div className="text-xs text-[var(--muted)] bg-green-500/5 border border-green-500/20 rounded px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--green)]" />
                {t("keyConfigured")} <code>{initial.claudeApiKeyPreview}</code>
              </div>
            )}
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              className="input"
              autoComplete="off"
            />
            <select
              value={claudeModel}
              onChange={(e) => setClaudeModel(e.target.value)}
              className="input"
            >
              {MODEL_PRESETS.claude.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button onClick={saveClaude} disabled={saving} className="btn btn-primary">
              <Save size={14} /> {t("save")}
            </button>
          </div>
        )}

        {provider === "gemini" && (
          <div className="space-y-3">
            {initial.geminiApiKey && (
              <div className="text-xs text-[var(--muted)] bg-green-500/5 border border-green-500/20 rounded px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--green)]" />
                {t("keyConfigured")} <code>{initial.geminiApiKeyPreview}</code>
              </div>
            )}
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="input"
              autoComplete="off"
            />
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="input"
            >
              {MODEL_PRESETS.gemini.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button onClick={saveGemini} disabled={saving} className="btn btn-primary">
              <Save size={14} /> {t("save")}
            </button>
            <p
              className="text-xs text-[var(--muted)]"
              dangerouslySetInnerHTML={{ __html: t.raw("geminiHint") as string }}
            />
          </div>
        )}

        {provider === "openai-compat" && (
          <div className="space-y-3">
            {initial.openaiApiKey && (
              <div className="text-xs text-[var(--muted)] bg-green-500/5 border border-green-500/20 rounded px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--green)]" />
                {t("keyConfigured")} <code>{initial.openaiApiKeyPreview}</code>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("endpoint")}
              </label>
              <select
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                className="input"
              >
                {BASE_URL_PRESETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              {openaiBaseUrl && (
                <input
                  type="text"
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  className="input mt-2 text-xs"
                  placeholder="https://..."
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("apiKey")}</label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-... / gsk_... (Groq)"
                className="input"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("model")}</label>
              <select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                className="input"
              >
                {MODEL_PRESETS["openai-compat"].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                className="input mt-2 text-xs"
                placeholder={t("modelNameManual")}
              />
            </div>
            <button onClick={saveOpenai} disabled={saving} className="btn btn-primary">
              <Save size={14} /> {t("save")}
            </button>
            <p
              className="text-xs text-[var(--muted)]"
              dangerouslySetInnerHTML={{ __html: t.raw("groqHint") as string }}
            />
          </div>
        )}

        {provider === "ollama" && (
          <div className="space-y-3">
            {initial.ollamaConfigured && (
              <div className="text-xs text-[var(--muted)] bg-green-500/5 border border-green-500/20 rounded px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--green)]" />
                {t("configured")} <code>{initial.ollamaBaseUrl}</code> → <code>{initial.ollamaModel || t("defaultEmpty")}</code>
              </div>
            )}
            <div className="text-xs text-[var(--muted)] bg-yellow-500/5 border border-yellow-500/30 rounded px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <strong>{t("ollamaWarningTitle")}</strong>{" "}
                <span dangerouslySetInnerHTML={{ __html: t.raw("ollamaWarning") as string }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("endpoint")}
              </label>
              <select
                value={
                  OLLAMA_BASE_URL_PRESETS.some((b) => b.value === ollamaBaseUrl)
                    ? ollamaBaseUrl
                    : ""
                }
                onChange={(e) => {
                  if (e.target.value) setOllamaBaseUrl(e.target.value);
                }}
                className="input"
              >
                <option value="">{t("ollamaOwnUrl")}</option>
                {OLLAMA_BASE_URL_PRESETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                className="input mt-2 text-xs"
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("model")}
              </label>
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="input"
              >
                {MODEL_PRESETS.ollama.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="input mt-2 text-xs"
                placeholder={t("ollamaModelExample")}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={testOllama}
                disabled={ollamaTesting || !ollamaBaseUrl}
                className="btn"
                title={t("ollamaTestTitle")}
              >
                {ollamaTesting ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                {t("ollamaTest")}
              </button>
              <button onClick={saveOllama} disabled={saving} className="btn btn-primary">
                <Save size={14} /> {t("save")}
              </button>
            </div>
            {ollamaTestResult?.ok === true && (
              <div className="text-xs bg-green-500/5 border border-green-500/20 rounded px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[var(--green)]">
                  <CheckCircle2 size={14} />
                  <strong>{t("ollamaSuccess")}</strong> — {ollamaTestResult.models.length} {t("ollamaInstalled")}
                </div>
                {ollamaTestResult.models.length > 0 && (
                  <div className="space-y-0.5">
                    {ollamaTestResult.models.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => setOllamaModel(m.name)}
                        className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-[var(--surface-2)] ${
                          ollamaModel === m.name
                            ? "bg-blue-500/10 border border-[var(--accent)]"
                            : "border border-transparent"
                        }`}
                      >
                        <code className="text-xs">{m.name}</code>
                        {m.sizeMb !== null && (
                          <span className="text-[10px] text-[var(--muted)]">
                            {m.sizeMb >= 1024
                              ? `${(m.sizeMb / 1024).toFixed(1)} GB`
                              : `${m.sizeMb} MB`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {ollamaTestResult.models.length === 0 && (
                  <p
                    className="text-[var(--muted)]"
                    dangerouslySetInnerHTML={{ __html: t.raw("ollamaNoModels") as string }}
                  />
                )}
              </div>
            )}
            {ollamaTestResult?.ok === false && (
              <div className="text-xs bg-red-500/5 border border-red-500/20 rounded px-3 py-2 flex items-start gap-2 text-[var(--red)]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  <strong>{t("ollamaFailed")}</strong> {ollamaTestResult.error}
                </div>
              </div>
            )}
            <p
              className="text-xs text-[var(--muted)]"
              dangerouslySetInnerHTML={{ __html: t.raw("ollamaTip") as string }}
            />
          </div>
        )}
      </div>
    </div>

    {configured.length > 0 && (
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("orderTitle")}</h2>
        </div>
        <p
          className="text-xs text-[var(--muted)]"
          dangerouslySetInnerHTML={{ __html: t.raw("orderBody") as string }}
        />
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md">
          {order.map((p, idx) => {
            const i = PROVIDER_INFO[p];
            const isDisabled = disabled.includes(p);
            const model =
              p === "claude"
                ? initial.claudeModel
                : p === "gemini"
                  ? initial.geminiModel
                  : p === "openai-compat"
                    ? initial.openaiModel
                    : initial.ollamaModel;
            return (
              <li
                key={p}
                className={`flex items-center gap-3 p-3 ${
                  isDisabled ? "opacity-60" : ""
                }`}
              >
                <span className="num text-xs w-5 text-center text-[var(--muted)]">
                  {idx + 1}.
                </span>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0 || saving}
                    className="p-0.5 rounded border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-2)]"
                    aria-label={t("moveUp", { label: i.label })}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === order.length - 1 || saving}
                    className="p-0.5 rounded border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-2)]"
                    aria-label={t("moveDown", { label: i.label })}
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {i.label}
                    {isDisabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-[var(--red)] border border-red-500/30">
                        {t("paused")}
                      </span>
                    )}
                    {!isDisabled && idx === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-[var(--green)] border border-green-500/30">
                        {t("primary")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {model || t("defaultModel")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDisabled(p)}
                  disabled={saving}
                  className={`btn ${
                    isDisabled ? "" : "btn-ghost"
                  } text-xs`}
                  title={isDisabled ? t("enableAria") : t("disableAria")}
                >
                  {isDisabled ? (
                    <>
                      <Power size={12} /> {t("enable")}
                    </>
                  ) : (
                    <>
                      <PowerOff size={12} /> {t("disable")}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {orderChanged && (
          <button
            onClick={savePriority}
            disabled={saving}
            className="btn btn-primary"
          >
            <Save size={14} /> {t("savePriority")}
          </button>
        )}
        {disabled.length === configured.length && (
          <div className="text-xs text-[var(--red)] bg-red-500/5 border border-red-500/20 rounded px-3 py-2">
            {t("allPausedWarning")}
          </div>
        )}
      </div>
    )}
    </>
  );
}
