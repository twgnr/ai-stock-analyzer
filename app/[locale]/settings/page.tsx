"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Save,
  AlertCircle,
  CheckCircle2,
  User as UserIcon,
  Lock,
  Activity,
  MailWarning,
  Bell,
  ShieldCheck,
  Smartphone,
  PowerOff,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AiAccessStatus } from "@/components/AiAccessStatus";
import { AiProviderSettings } from "@/components/AiProviderSettings";
import { AccountActions } from "@/components/AccountActions";
import { AppPreferencesCard } from "@/components/AppPreferencesCard";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";

interface Settings {
  email: string;
  name?: string;
  baseCurrency: string;
  aiProvider: "claude" | "gemini" | "openai-compat" | "ollama";
  aiProviderOrder: ("claude" | "gemini" | "openai-compat" | "ollama")[];
  disabledAiProviders: ("claude" | "gemini" | "openai-compat" | "ollama")[];
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
  hasClaudeKey: boolean;
  emailVerified?: boolean;
  digestEnabled?: boolean;
  alertsEnabled?: boolean;
  notificationEmail?: string;
  totpEnabled?: boolean;
  aiDisabled?: boolean;
}

interface UsageStats {
  total: { count: number; cost: number; inputTokens: number; outputTokens: number };
  last30Days: { count: number; cost: number; inputTokens: number; outputTokens: number };
  byOperation: Array<{ _id: string; count: number; cost: number }>;
}

type TabId = "profile" | "security" | "ai" | "notifications" | "usage";

interface TabDef {
  id: TabId;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: "profile", icon: UserIcon },
  { id: "security", icon: ShieldCheck },
  { id: "ai", icon: Sparkles },
  { id: "notifications", icon: Bell },
  { id: "usage", icon: Activity },
];

const TAB_IDS = TABS.map((t) => t.id) as TabId[];

function fmtCost(usd: number): string {
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

function readTabFromHash(): TabId | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace("#", "") as TabId;
  return TAB_IDS.includes(h) ? h : null;
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [resending, setResending] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | undefined>(undefined);

  const [totpMode, setTotpMode] = useState<"idle" | "setup" | "disable">("idle");
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpPassword, setTotpPassword] = useState("");

  const tablistRef = useRef<HTMLDivElement>(null);
  // Tab-State direkt: einmaliger Read aus URL-Hash nach Mount, danach
  // selber Treiber. Kein useSyncExternalStore + dispatchEvent — die
  // synchrone Notify-Schleife darin produzierte unter bestimmten Click-
  // Handler-Konstellationen einen Render-Sturm.
  const [tab, setTab] = useState<TabId>("profile");

  useEffect(() => {
    const initial = readTabFromHash();
    // Synchronisation mit Browser-Hash beim Mount und bei externen
    // Hash-Änderungen (Back/Forward, andere Skripte). Hier ist setState in
    // Effect korrekt — der Linter erkennt den externen Quelle-Charakter
    // dieser Sync-Logik nicht.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) setTab(initial);
    function onHash() {
      const t = readTabFromHash();
      if (t) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTab(t);
      }
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function selectTab(next: TabId) {
    setTab(next);
    setError(null);
    setSuccess(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
  }

  function onTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = TAB_IDS.indexOf(tab);
    if (idx < 0) return;
    let nextIdx = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % TAB_IDS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      nextIdx = (idx - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TAB_IDS.length - 1;
    else return;
    e.preventDefault();
    const nextTab = TAB_IDS[nextIdx];
    selectTab(nextTab);
    requestAnimationFrame(() => {
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${nextTab}"]`
      );
      btn?.focus();
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [resSet, resMe, resUsage] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/settings/usage", { cache: "no-store" }),
      ]);
      const data = await resSet.json();
      const me = await resMe.json();
      const u = await resUsage.json();
      setSettings(data);
      setName(data.name || "");
      setBaseCurrency(data.baseCurrency || "EUR");
      setDigestEnabled(!!data.digestEnabled);
      setAlertsEnabled(data.alertsEnabled !== false);
      setNotificationEmail(data.notificationEmail || "");
      setEmailVerified(me?.user?.emailVerified);
      if (!u.error) setUsage(u);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function resendVerify() {
    setResending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(t("emailVerify.sent"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setResending(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setSuccess(t("profile.saved"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAiDisabled(next: boolean) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiDisabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setSuccess(next ? t("ai.paused") : t("ai.unpaused"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function saveNotifications() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEnabled, alertsEnabled, notificationEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setSuccess(t("notifications.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setError(t("security.password.mismatch"));
      return;
    }
    if (newPassword.length < 10) {
      setError(t("security.password.tooShort"));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setSuccess(t("security.password.saved"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function startTotpSetup() {
    setError(null);
    setSuccess(null);
    setTotpMode("setup");
    try {
      const res = await fetch("/api/auth/2fa/setup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTotpQr(data.qrDataUrl);
      setTotpSecret(data.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setTotpMode("idle");
    }
  }

  async function verifyTotpSetup() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(t("security.twoFactor.enabled"));
      setTotpMode("idle");
      setTotpQr(null);
      setTotpSecret(null);
      setTotpCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function disableTotp() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: totpPassword, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(t("security.twoFactor.disabled"));
      setTotpMode("idle");
      setTotpCode("");
      setTotpPassword("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        <div className="spinner mb-2" />
        <div>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div role="status" className="card p-3 text-[var(--green)] flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {emailVerified === false && (
        <div className="card p-4 bg-yellow-500/5 border-yellow-500/30 space-y-2">
          <div className="flex items-center gap-2 text-yellow-400">
            <MailWarning size={16} />
            <h2 className="font-semibold">{t("emailVerify.title")}</h2>
          </div>
          <p className="text-sm">{t("emailVerify.body")}</p>
          <button onClick={resendVerify} disabled={resending} className="btn">
            {resending ? <div className="spinner" /> : <MailWarning size={14} />}
            {t("emailVerify.resend")}
          </button>
        </div>
      )}

      <div
        ref={tablistRef}
        role="tablist"
        aria-label={t("tablistLabel")}
        onKeyDown={onTabKeyDown}
        className="border-b border-[var(--border)] flex gap-0.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((tab_) => {
          const Icon = tab_.icon;
          const isActive = tab === tab_.id;
          return (
            <button
              key={tab_.id}
              role="tab"
              type="button"
              data-tab-id={tab_.id}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab_.id}`}
              id={`tab-${tab_.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab_.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-[var(--accent)] text-[var(--foreground)] font-medium"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {t(`tabs.${tab_.id}`)}
            </button>
          );
        })}
      </div>

      {tab === "profile" && (
        <section
          role="tabpanel"
          id="tabpanel-profile"
          aria-labelledby="tab-profile"
          className="space-y-6"
        >
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserIcon size={16} className="text-[var(--accent)]" />
              <h2 className="font-semibold">{t("profile.title")}</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("profile.email")}
              </label>
              <input
                type="email"
                value={settings?.email || ""}
                disabled
                className="input opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("profile.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("profile.baseCurrency")}
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="input"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
            <button onClick={saveProfile} disabled={saving} className="btn btn-primary">
              <Save size={14} /> {t("profile.save")}
            </button>
          </div>

          <AppPreferencesCard />

          <AccountActions />
        </section>
      )}

      {tab === "security" && (
        <section
          role="tabpanel"
          id="tabpanel-security"
          aria-labelledby="tab-security"
          className="space-y-6"
        >
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--accent)]" />
              <h2 className="font-semibold">{t("security.twoFactor.title")}</h2>
              {settings?.totpEnabled ? (
                <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-[var(--green)] border border-green-500/20">
                  {t("security.twoFactor.active")}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]">
                  {t("security.twoFactor.inactive")}
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--muted)]">
              {t("security.twoFactor.description")}
            </p>

            {!settings?.totpEnabled && totpMode !== "setup" && (
              <button onClick={startTotpSetup} className="btn btn-primary">
                <Smartphone size={14} /> {t("security.twoFactor.enable")}
              </button>
            )}

            {totpMode === "setup" && totpQr && (
              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <div className="text-sm">
                  <strong>{t("security.twoFactor.step1")}</strong> {t("security.twoFactor.scanQr")}
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <Image
                    src={totpQr}
                    alt={t("security.twoFactor.qrAlt")}
                    width={220}
                    height={220}
                    unoptimized
                    className="border border-[var(--border)] rounded"
                  />
                  <div className="text-xs text-[var(--muted)] space-y-1">
                    <div>{t("security.twoFactor.manualEntry")}</div>
                    <code className="block bg-[var(--surface-2)] px-2 py-1 rounded select-all text-[var(--foreground)]">
                      {totpSecret}
                    </code>
                    <div>{t("security.twoFactor.details")}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <strong>{t("security.twoFactor.step2")}</strong> {t("security.twoFactor.enterCode")}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("security.twoFactor.codePlaceholder")}
                  className="input text-center text-lg tracking-widest font-mono"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={verifyTotpSetup}
                    disabled={saving || totpCode.length !== 6}
                    className="btn btn-primary"
                  >
                    <CheckCircle2 size={14} /> {t("security.twoFactor.activate")}
                  </button>
                  <button
                    onClick={() => {
                      setTotpMode("idle");
                      setTotpQr(null);
                      setTotpCode("");
                    }}
                    className="btn"
                  >
                    {t("security.twoFactor.cancel")}
                  </button>
                </div>
              </div>
            )}

            {settings?.totpEnabled && totpMode !== "disable" && (
              <button onClick={() => setTotpMode("disable")} className="btn btn-danger">
                {t("security.twoFactor.disable")}
              </button>
            )}

            {settings?.totpEnabled && totpMode === "disable" && (
              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <p className="text-sm">{t("security.twoFactor.disablePrompt")}</p>
                <input
                  type="password"
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  placeholder={t("security.twoFactor.passwordPlaceholder")}
                  className="input"
                  autoComplete="current-password"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("security.twoFactor.totpPlaceholder")}
                  className="input text-center font-mono tracking-widest"
                />
                <div className="flex gap-2">
                  <button
                    onClick={disableTotp}
                    disabled={saving || !totpPassword || totpCode.length !== 6}
                    className="btn btn-danger"
                  >
                    {t("security.twoFactor.confirmDisable")}
                  </button>
                  <button
                    onClick={() => {
                      setTotpMode("idle");
                      setTotpCode("");
                      setTotpPassword("");
                    }}
                    className="btn"
                  >
                    {t("security.twoFactor.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-[var(--accent)]" />
              <h2 className="font-semibold">{t("security.password.title")}</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("security.password.current")}
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("security.password.new")}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("security.password.confirm")}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
            </div>
            <button
              onClick={changePassword}
              disabled={saving || !currentPassword || !newPassword}
              className="btn btn-primary"
            >
              <Save size={14} /> {t("security.password.save")}
            </button>
          </div>
        </section>
      )}

      {tab === "ai" && (
        <section
          role="tabpanel"
          id="tabpanel-ai"
          aria-labelledby="tab-ai"
          className="space-y-6"
        >
          <AiAccessStatus />

          {settings && (
            <div
              className={`card p-5 space-y-3 ${
                settings.aiDisabled ? "border-yellow-500/40 bg-yellow-500/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <PowerOff
                  size={16}
                  className={settings.aiDisabled ? "text-yellow-400" : "text-[var(--accent)]"}
                  aria-hidden="true"
                />
                <h2 className="font-semibold">{t("ai.kiUsageTitle")}</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">{t("ai.kiUsageBody")}</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings.aiDisabled}
                  onChange={(e) => toggleAiDisabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">
                  {settings.aiDisabled ? t("ai.pausedActive") : t("ai.pauseToggle")}
                </span>
              </label>
            </div>
          )}

          {settings && (
            <AiProviderSettings
              initial={settings}
              onSaved={load}
              onError={setError}
              onSuccess={setSuccess}
            />
          )}
        </section>
      )}

      {tab === "notifications" && (
        <section
          role="tabpanel"
          id="tabpanel-notifications"
          aria-labelledby="tab-notifications"
          className="space-y-6"
        >
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-[var(--accent)]" />
              <h2 className="font-semibold">{t("notifications.title")}</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("notifications.emailLabel")}
              </label>
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder={settings?.email}
                className="input"
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => setAlertsEnabled(e.target.checked)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: t.raw("notifications.alertsLabel") as string }}
              />
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={digestEnabled}
                onChange={(e) => setDigestEnabled(e.target.checked)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: t.raw("notifications.digestLabel") as string }}
              />
            </label>
            <button onClick={saveNotifications} disabled={saving} className="btn btn-primary">
              <Save size={14} /> {t("notifications.save")}
            </button>
          </div>

          <div className="card p-5 space-y-4">
            <PushNotificationsToggle />
          </div>
        </section>
      )}

      {tab === "usage" && (
        <section
          role="tabpanel"
          id="tabpanel-usage"
          aria-labelledby="tab-usage"
          className="space-y-6"
        >
          {usage ? (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-[var(--accent)]" />
                <h2 className="font-semibold">{t("usage.title")}</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatSmall label={t("usage.calls30d")} value={String(usage.last30Days.count)} />
                <StatSmall label={t("usage.cost30d")} value={fmtCost(usage.last30Days.cost)} />
                <StatSmall label={t("usage.callsTotal")} value={String(usage.total.count)} />
                <StatSmall label={t("usage.costTotal")} value={fmtCost(usage.total.cost)} />
              </div>
              {usage.byOperation.length > 0 && (
                <div className="space-y-1 text-xs pt-3 border-t border-[var(--border)]">
                  <div className="text-[var(--muted)] uppercase tracking-wider mb-2">
                    {t("usage.byOperation")}
                  </div>
                  {usage.byOperation.map((op) => (
                    <div key={op._id} className="flex justify-between items-center">
                      <span className="font-mono">{op._id}</span>
                      <span className="text-[var(--muted)]">
                        {op.count} {t("usage.callsSuffix")} · {fmtCost(op.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">{t("usage.billingNote")}</p>
            </div>
          ) : (
            <div className="card p-8 text-center text-sm text-[var(--muted)]">
              {t("usage.noData")}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatSmall({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] rounded-md p-3">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-lg font-semibold num">{value}</div>
    </div>
  );
}
