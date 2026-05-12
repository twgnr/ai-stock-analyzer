"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Save,
  AlertCircle,
  CheckCircle2,
  Key,
  DollarSign,
  PowerOff,
} from "lucide-react";

interface KeyHint {
  set: boolean;
  hint: string;
}

export interface AiSettings {
  claudeKey: KeyHint;
  claudeModel: string;
  geminiKey: KeyHint;
  geminiModel: string;
  openaiKey: KeyHint;
  openaiBaseUrl: string;
  openaiModel: string;
  allowSharedKeyUsage: boolean;
  dailyCostLimitUsd: number;
  monthlyCostLimitUsd: number;
  sharedKeyPaused?: boolean;
}

interface Props {
  settings: AiSettings;
  onSaved: (next: AiSettings) => void;
}

interface PatchPayload {
  ai: {
    claudeApiKey?: string;
    claudeModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    allowSharedKeyUsage?: boolean;
    dailyCostLimitUsd?: number;
    monthlyCostLimitUsd?: number;
    sharedKeyPaused?: boolean;
  };
}

export function AdminAiSettingsCard({ settings, onSaved }: Props) {
  const t = useTranslations("Admin.ai");
  const tCommon = useTranslations("Admin.common");
  const [claudeKey, setClaudeKey] = useState("");
  const [claudeModel, setClaudeModel] = useState(settings.claudeModel);
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(settings.openaiBaseUrl);
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel);
  const [allowShared, setAllowShared] = useState(settings.allowSharedKeyUsage);
  const [daily, setDaily] = useState(settings.dailyCostLimitUsd);
  const [monthly, setMonthly] = useState(settings.monthlyCostLimitUsd);
  const [sharedPaused, setSharedPaused] = useState(!!settings.sharedKeyPaused);
  const [saving, setSaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const body: PatchPayload = { ai: {} };
    // Key-Felder nur senden wenn der Admin etwas neu eingegeben hat —
    // ein leeres Textfeld lässt den bestehenden Key unverändert.
    if (claudeKey.trim() !== "") body.ai.claudeApiKey = claudeKey.trim();
    if (geminiKey.trim() !== "") body.ai.geminiApiKey = geminiKey.trim();
    if (openaiKey.trim() !== "") body.ai.openaiApiKey = openaiKey.trim();
    body.ai.claudeModel = claudeModel;
    body.ai.geminiModel = geminiModel;
    body.ai.openaiBaseUrl = openaiBaseUrl;
    body.ai.openaiModel = openaiModel;
    body.ai.allowSharedKeyUsage = allowShared;
    body.ai.dailyCostLimitUsd = daily;
    body.ai.monthlyCostLimitUsd = monthly;
    body.ai.sharedKeyPaused = sharedPaused;

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(t("saved"));
      setClaudeKey("");
      setGeminiKey("");
      setOpenaiKey("");
      onSaved(data.ai);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  async function togglePaused(next: boolean) {
    setPausing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: { sharedKeyPaused: next } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSharedPaused(next);
      setMessage(next ? t("paused") : t("unpaused"));
      onSaved(data.ai);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setPausing(false);
    }
  }

  async function removeKey(provider: "claude" | "gemini" | "openai") {
    const providerLabel =
      provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : "Claude";
    if (!confirm(t("confirmDeleteKey", { label: providerLabel }))) return;
    setSaving(true);
    setError(null);
    try {
      const body: PatchPayload = { ai: {} };
      if (provider === "claude") body.ai.claudeApiKey = "";
      if (provider === "gemini") body.ai.geminiApiKey = "";
      if (provider === "openai") body.ai.openaiApiKey = "";
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved(data.ai);
      setMessage(t("keyDeleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <div className="text-xs text-[var(--muted)]">{t("body")}</div>

      {error && (
        <div className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-[var(--green)] flex items-center gap-2">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      <div
        className={`border rounded-lg p-3 space-y-2 ${
          sharedPaused
            ? "border-yellow-500/50 bg-yellow-500/10"
            : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <PowerOff
            size={14}
            className={sharedPaused ? "text-yellow-400" : "text-[var(--muted)]"}
            aria-hidden="true"
          />
          <div className="font-medium text-sm">{t("pauseTitle")}</div>
        </div>
        <p className="text-xs text-[var(--muted)]">{t("pauseBody")}</p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sharedPaused}
            onChange={(e) => togglePaused(e.target.checked)}
            disabled={pausing}
            className="w-4 h-4"
          />
          <span className="text-sm">
            {sharedPaused ? t("pausedActive") : t("pauseToggle")}
          </span>
          {pausing && <div className="spinner" />}
        </label>
      </div>

      <div className="space-y-3">
        <ProviderBlock
          label={t("providers.claudeLabel")}
          keyHint={settings.claudeKey}
          keyValue={claudeKey}
          onKeyChange={setClaudeKey}
          modelValue={claudeModel}
          onModelChange={setClaudeModel}
          modelPlaceholder={t("providers.claudeModelPlaceholder")}
          onRemove={settings.claudeKey.set ? () => removeKey("claude") : undefined}
        />
        <ProviderBlock
          label={t("providers.geminiLabel")}
          keyHint={settings.geminiKey}
          keyValue={geminiKey}
          onKeyChange={setGeminiKey}
          modelValue={geminiModel}
          onModelChange={setGeminiModel}
          modelPlaceholder={t("providers.geminiModelPlaceholder")}
          onRemove={settings.geminiKey.set ? () => removeKey("gemini") : undefined}
        />
        <ProviderBlock
          label={t("providers.openaiLabel")}
          keyHint={settings.openaiKey}
          keyValue={openaiKey}
          onKeyChange={setOpenaiKey}
          modelValue={openaiModel}
          onModelChange={setOpenaiModel}
          modelPlaceholder={t("providers.openaiModelPlaceholder")}
          baseUrl={openaiBaseUrl}
          onBaseUrlChange={setOpenaiBaseUrl}
          baseUrlPlaceholder={t("providers.openaiBaseUrlPlaceholder")}
          onRemove={settings.openaiKey.set ? () => removeKey("openai") : undefined}
        />
      </div>

      <div className="border-t border-[var(--border)] pt-3 space-y-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allowShared}
            onChange={(e) => setAllowShared(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <Key size={13} className="text-[var(--accent)]" />
              {t("allowShared")}
            </span>
            <span className="text-xs text-[var(--muted)]">{t("allowSharedBody")}</span>
          </span>
        </label>

        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-1">
            <DollarSign size={13} className="text-[var(--accent)]" />
            {t("limitsTitle")}
          </div>
          <div className="text-xs text-[var(--muted)]">{t("limitsBody")}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <LimitInput
              label={t("dailyLimit")}
              value={daily}
              onChange={setDaily}
            />
            <LimitInput
              label={t("monthlyLimit")}
              value={monthly}
              onChange={setMonthly}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? <div className="spinner" /> : <Save size={14} />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function ProviderBlock({
  label,
  keyHint,
  keyValue,
  onKeyChange,
  modelValue,
  onModelChange,
  modelPlaceholder,
  baseUrl,
  onBaseUrlChange,
  baseUrlPlaceholder,
  onRemove,
}: {
  label: string;
  keyHint: KeyHint;
  keyValue: string;
  onKeyChange: (s: string) => void;
  modelValue: string;
  onModelChange: (s: string) => void;
  modelPlaceholder: string;
  baseUrl?: string;
  onBaseUrlChange?: (s: string) => void;
  baseUrlPlaceholder?: string;
  onRemove?: () => void;
}) {
  const t = useTranslations("Admin.ai.providers");
  return (
    <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-[var(--muted)]">
          {keyHint.set ? (
            <>
              {t("currentKey")} <span className="num">{keyHint.hint}</span>
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="ml-2 text-[var(--red)] hover:underline"
                >
                  {t("delete")}
                </button>
              )}
            </>
          ) : (
            <span className="text-yellow-400">{t("noKey")}</span>
          )}
        </div>
      </div>
      <input
        type="password"
        value={keyValue}
        onChange={(e) => onKeyChange(e.target.value)}
        placeholder={keyHint.set ? t("keyPlaceholderConfigured") : t("keyPlaceholderEmpty")}
        className="input"
        autoComplete="off"
      />
      {onBaseUrlChange && (
        <input
          type="text"
          value={baseUrl ?? ""}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={baseUrlPlaceholder}
          className="input"
        />
      )}
      <input
        type="text"
        value={modelValue}
        onChange={(e) => onModelChange(e.target.value)}
        placeholder={modelPlaceholder}
        className="input"
      />
    </div>
  );
}

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted)] mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        min={0}
        step={0.5}
        className="input"
      />
    </div>
  );
}
