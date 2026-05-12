"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Shield,
  Trash2,
  UserCheck,
  UserX,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Send,
  ShieldCheck,
  Clock,
  BookOpen,
  Globe,
  Lock,
  Megaphone,
  Save,
  Gauge,
  ArrowUp,
  ArrowDown,
  Layers as LayersIcon,
  Timer,
  Database,
} from "lucide-react";
import { fmtNumber } from "@/lib/format";
import { AdminAiSettingsCard } from "@/components/AdminAiSettingsCard";

interface AdminUser {
  _id: string;
  email: string;
  name?: string;
  role: "user" | "admin";
  emailVerified: boolean;
  approved: boolean;
  hasClaudeKey: boolean;
  baseCurrency: string;
  lastLoginAt?: string;
  createdAt: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCostUSD: number;
    callCount: number;
    costThisMonthUSD: number;
  };
}

interface KeyHint {
  set: boolean;
  hint: string;
}

interface AiSettings {
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

interface YahooQuotaStatus {
  date: string;
  usedToday: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  lastLimitHitAt: string | null;
}

type QuoteProviderKey = "yahoo" | "finnhub" | "stooq";

interface QuoteProvidersConfig {
  order: QuoteProviderKey[];
  yahooEnabled: boolean;
  finnhubEnabled: boolean;
  stooqEnabled: boolean;
  finnhubKey: KeyHint;
}

interface MoversAutoScanConfig {
  enabled: boolean;
  provider: "yahoo" | "finnhub";
  intervalMinutes: number;
  tradingHoursOnly: boolean;
}

interface AutoUpdateConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastTickerCount: number | null;
}

interface DataSourcesConfig {
  fredKey: KeyHint;
  secUserAgent: string;
  redditClientId: string;
  redditClientSecret: KeyHint;
}

interface AppSettings {
  requireApproval: boolean;
  magazineSharingEnabled: boolean;
  loginNoticeText?: string;
  loginNoticeEnabled?: boolean;
  yahooDailyQuotaLimit?: number;
  yahooQuota?: YahooQuotaStatus;
  quoteProviders?: QuoteProvidersConfig;
  moversAutoScan?: MoversAutoScanConfig;
  autoUpdate?: AutoUpdateConfig;
  ai: AiSettings;
  dataSources?: DataSourcesConfig;
}

type AdminTabId = "overview" | "users" | "data" | "automation" | "ai";

const ADMIN_TAB_IDS: AdminTabId[] = ["overview", "users", "data", "automation", "ai"];

interface UsageStats {
  byOperation: Array<{
    _id: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  byUser: Array<{
    email: string;
    name?: string;
    count: number;
    cost: number;
  }>;
  recentActivity: Array<{
    _id: string;
    userEmail: string | null;
    operation: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUSD: number;
    success: boolean;
    createdAt: string;
  }>;
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default function AdminPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testEmailTarget, setTestEmailTarget] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [tab, setTab] = useState<AdminTabId>("overview");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [u, us, s] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/usage").then((r) => r.json()),
        fetch("/api/admin/settings").then((r) => r.json()),
      ]);
      if (u.error) throw new Error(u.error);
      setUsers(u.users);
      setUsage(us);
      if (!s.error) setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function toggleRequireApproval() {
    if (!settings) return;
    const next = !settings.requireApproval;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApproval: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(next ? t("overview.registration.enabled") : t("overview.registration.disabled"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleMagazineSharing() {
    if (!settings) return;
    const next = !settings.magazineSharingEnabled;
    if (!next && !confirm(t("overview.magazine.confirmDisable"))) {
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magazineSharingEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(next ? t("overview.magazine.enabled") : t("overview.magazine.disabled"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveMoversAutoScan(patch: Partial<MoversAutoScanConfig>) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moversAutoScan: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(t("moversAutoScan.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveQuoteProviders(patch: {
    order?: QuoteProviderKey[];
    yahooEnabled?: boolean;
    finnhubEnabled?: boolean;
    stooqEnabled?: boolean;
    finnhubApiKey?: string;
  }) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteProviders: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(t("quoteProviders.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveAutoUpdate(patch: {
    enabled?: boolean;
    intervalMinutes?: number;
  }) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoUpdate: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(t("autoUpdate.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function triggerAutoUpdate() {
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auto-update", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setMessage(
        t("autoUpdate.triggered", {
          tickers: data.tickersRefreshed,
          movers: data.moversScanned,
          seconds: Math.round(data.durationMs / 1000),
        })
      );
      // Settings reloaden, damit lastRunAt aktuell ist.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("autoUpdate.triggerError"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveDataSources(patch: {
    fredApiKey?: string;
    secUserAgent?: string;
    redditClientId?: string;
    redditClientSecret?: string;
  }) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSources: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(t("dataSources.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveYahooQuota(limit: number) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yahooDailyQuotaLimit: limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(
        limit === 0
          ? t("yahooQuota.savedDisabled")
          : t("yahooQuota.saved", { limit: limit.toLocaleString(dateLocale) })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveLoginNotice(text: string, enabled: boolean) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginNoticeText: text, loginNoticeEnabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data);
      setMessage(enabled ? t("overview.loginNotice.saved") : t("overview.loginNotice.savedDisabled"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function approveUser(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(t("users.messages.approved", { email: user.email }));
    load();
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleRole(user: AdminUser) {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(t("users.messages.confirmRole", { email: user.email, role: newRole }))) return;
    const res = await fetch(`/api/admin/users/${user._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(t("users.messages.roleChanged", { email: user.email, role: newRole }));
    load();
  }

  async function verifyUser(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailVerified: true }),
    });
    if (res.ok) {
      setMessage(t("users.messages.verified", { email: user.email }));
      load();
    } else {
      const d = await res.json();
      setError(d.error);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(t("users.messages.confirmDelete", { email: user.email }))) return;
    const res = await fetch(`/api/admin/users/${user._id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(t("users.messages.deleted", { email: user.email }));
    load();
  }

  async function sendReset(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user._id}/send-reset`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    if (data.mailSent) {
      setMessage(t("users.messages.resetSent", { email: user.email }));
    } else {
      setMessage(t("users.messages.resetFallback", { url: data.resetUrlFallback }));
    }
  }

  async function testEmail() {
    setTestEmailSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmailTarget || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.sent) {
        setMessage(t("overview.emailTest.sent", { to: data.to }));
      } else {
        setMessage(t("overview.emailTest.fallback", { message: data.fallbackMessage }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setTestEmailSending(false);
    }
  }

  const totalCostMonth = users.reduce((s, u) => s + u.usage.costThisMonthUSD, 0);
  const totalCallCount = users.reduce((s, u) => s + u.usage.callCount, 0);
  const pendingCount = users.filter((u) => !u.approved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield size={22} className="text-yellow-400" />
          {t("title")}
        </h1>
        <button onClick={load} className="btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div role="status" className="card p-3 text-[var(--green)] flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={t("stats.users")} value={String(users.length)} />
        <Stat
          label={t("stats.verified")}
          value={`${users.filter((u) => u.emailVerified).length} / ${users.length}`}
        />
        <Stat
          label={t("stats.pending")}
          value={String(pendingCount)}
          highlight={pendingCount > 0}
        />
        <Stat label={t("stats.aiCosts30d")} value={fmtCost(totalCostMonth)} />
      </div>

      <div
        role="tablist"
        aria-label={t("tablistLabel")}
        className="border-b border-[var(--border)] flex gap-0.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"
      >
        {ADMIN_TAB_IDS.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`admin-tabpanel-${id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-[var(--accent)] text-[var(--foreground)] font-medium"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {t(`tabs.${id}`)}
            </button>
          );
        })}
      </div>

      {tab === "overview" && settings && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[var(--accent)]" />
            <h2 className="font-semibold">{t("overview.registration.title")}</h2>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-sm max-w-xl">
              <div className="font-medium">{t("overview.registration.label")}</div>
              <div className="text-[var(--muted)] text-xs mt-1">
                {t("overview.registration.body")}
              </div>
            </div>
            <button
              onClick={toggleRequireApproval}
              disabled={savingSettings}
              className={`btn ${settings.requireApproval ? "btn-primary" : ""}`}
            >
              {savingSettings ? (
                <div className="spinner" />
              ) : settings.requireApproval ? (
                <CheckCircle2 size={14} />
              ) : (
                <Clock size={14} />
              )}
              {settings.requireApproval ? t("common.active") : t("common.inactive")}
            </button>
          </div>
          <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("overview.registration.footnote", { count: pendingCount })}
          </div>
        </div>
      )}

      {tab === "overview" && settings && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[var(--accent)]" />
            <h2 className="font-semibold">{t("overview.magazine.title")}</h2>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-sm max-w-xl">
              <div className="font-medium">{t("overview.magazine.label")}</div>
              <div className="text-[var(--muted)] text-xs mt-1">
                {t("overview.magazine.body")}
              </div>
            </div>
            <button
              onClick={toggleMagazineSharing}
              disabled={savingSettings}
              className={`btn ${settings.magazineSharingEnabled ? "btn-primary" : ""}`}
            >
              {savingSettings ? (
                <div className="spinner" />
              ) : settings.magazineSharingEnabled ? (
                <Globe size={14} />
              ) : (
                <Lock size={14} />
              )}
              {settings.magazineSharingEnabled
                ? t("overview.magazine.allowed")
                : t("overview.magazine.blocked")}
            </button>
          </div>
        </div>
      )}

      {tab === "overview" && settings && (
        <LoginNoticeCard
          initialText={settings.loginNoticeText || ""}
          initialEnabled={!!settings.loginNoticeEnabled}
          saving={savingSettings}
          onSave={saveLoginNotice}
        />
      )}

      {tab === "overview" && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-[var(--accent)]" />
            <h2 className="font-semibold">{t("overview.emailTest.title")}</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">{t("overview.emailTest.body")}</p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={testEmailTarget}
              onChange={(e) => setTestEmailTarget(e.target.value)}
              placeholder={t("overview.emailTest.placeholder")}
              className="input flex-1 min-w-[200px]"
            />
            <button onClick={testEmail} disabled={testEmailSending} className="btn btn-primary">
              {testEmailSending ? <div className="spinner" /> : <Send size={14} />}
              {t("overview.emailTest.send")}
            </button>
          </div>
        </div>
      )}

      {tab === "data" && settings && (
        <YahooQuotaCard
          initialLimit={settings.yahooDailyQuotaLimit ?? 5000}
          quota={settings.yahooQuota}
          saving={savingSettings}
          onSave={saveYahooQuota}
          dateLocale={dateLocale}
        />
      )}

      {tab === "data" && settings?.quoteProviders && (
        <QuoteProvidersCard
          providers={settings.quoteProviders}
          saving={savingSettings}
          onSave={saveQuoteProviders}
        />
      )}

      {tab === "data" && settings && (
        <DataSourcesCard
          dataSources={settings.dataSources}
          saving={savingSettings}
          onSave={saveDataSources}
        />
      )}

      {tab === "automation" && settings?.moversAutoScan && (
        <MoversAutoScanCard
          config={settings.moversAutoScan}
          finnhubKeySet={!!settings.quoteProviders?.finnhubKey.set}
          saving={savingSettings}
          onSave={saveMoversAutoScan}
        />
      )}

      {tab === "automation" && settings?.autoUpdate && (
        <AutoUpdateCard
          config={settings.autoUpdate}
          saving={savingSettings}
          onSave={saveAutoUpdate}
          onTrigger={triggerAutoUpdate}
          dateLocale={dateLocale}
        />
      )}

      {tab === "ai" && settings?.ai && (
        <AdminAiSettingsCard
          settings={settings.ai}
          onSaved={(ai) => setSettings({ ...settings, ai })}
        />
      )}

      {tab === "ai" && totalCallCount > 0 && (
        <div className="text-xs text-[var(--muted)]">
          {t("ai.totalCalls", { count: totalCallCount })}
        </div>
      )}

      {tab === "users" && (
      <div>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          {t("users.heading")}
        </h2>
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-3 py-3">{t("users.columns.email")}</th>
                <th className="text-left font-medium px-3 py-3">{t("users.columns.role")}</th>
                <th className="text-left font-medium px-3 py-3">{t("users.columns.status")}</th>
                <th className="text-right font-medium px-3 py-3">{t("users.columns.calls")}</th>
                <th className="text-right font-medium px-3 py-3">{t("users.columns.tokens")}</th>
                <th className="text-right font-medium px-3 py-3">{t("users.columns.cost30d")}</th>
                <th className="text-right font-medium px-3 py-3">{t("users.columns.lastLogin")}</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-3">
                    <div className="font-medium">{u.email}</div>
                    {u.name && <div className="text-xs text-[var(--muted)]">{u.name}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        u.role === "admin"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          : "bg-[var(--surface-2)] text-[var(--muted)]"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {!u.approved && (
                        <span className="text-[var(--red)] font-medium">
                          {t("users.pending")}
                        </span>
                      )}
                      <span
                        className={u.emailVerified ? "text-[var(--green)]" : "text-yellow-400"}
                      >
                        {u.emailVerified ? t("users.verified") : t("users.unverified")}
                      </span>
                      <span
                        className={u.hasClaudeKey ? "text-[var(--muted)]" : "text-[var(--red)]"}
                      >
                        {u.hasClaudeKey ? t("users.aiKeyConfigured") : t("users.aiKeyMissing")}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right num text-xs">{u.usage.callCount}</td>
                  <td className="px-3 py-3 text-right num text-xs">
                    {fmtTokens(u.usage.inputTokens + u.usage.outputTokens)}
                  </td>
                  <td className="px-3 py-3 text-right num text-xs">
                    {fmtCost(u.usage.costThisMonthUSD)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-[var(--muted)]">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleDateString(dateLocale)
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-end">
                      {!u.approved && (
                        <button
                          onClick={() => approveUser(u)}
                          className="p-2 text-[var(--red)] hover:text-[var(--green)]"
                          title={t("users.actions.approve")}
                          aria-label={t("users.actions.approveAria", { email: u.email })}
                        >
                          <ShieldCheck size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleRole(u)}
                        className="p-2 text-[var(--muted)] hover:text-yellow-400"
                        title={u.role === "admin" ? t("users.actions.toUser") : t("users.actions.toAdmin")}
                        aria-label={t("users.actions.toggleRoleAria", {
                          email: u.email,
                          role: u.role === "admin" ? t("users.actions.toUser") : t("users.actions.toAdmin"),
                        })}
                      >
                        {u.role === "admin" ? <UserX size={14} aria-hidden="true" /> : <UserCheck size={14} aria-hidden="true" />}
                      </button>
                      {!u.emailVerified && (
                        <button
                          onClick={() => verifyUser(u)}
                          className="p-2 text-[var(--muted)] hover:text-[var(--green)]"
                          title={t("users.actions.manualVerify")}
                          aria-label={t("users.actions.manualVerifyAria", { email: u.email })}
                        >
                          <CheckCircle2 size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => sendReset(u)}
                        className="p-2 text-[var(--muted)] hover:text-[var(--accent)]"
                        title={t("users.actions.sendReset")}
                        aria-label={t("users.actions.sendResetAria", { email: u.email })}
                      >
                        <KeyRound size={14} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => deleteUser(u)}
                        className="p-2 text-[var(--muted)] hover:text-[var(--red)]"
                        title={t("users.actions.delete")}
                        aria-label={t("users.actions.deleteAria", { email: u.email })}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === "ai" && usage && usage.byOperation.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("usage.byOperationTitle")}
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("usage.columns.operation")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.columns.calls")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.columns.inputTokens")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.columns.outputTokens")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.columns.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.byOperation.map((op) => (
                  <tr key={op._id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-3 font-mono text-xs">{op._id}</td>
                    <td className="px-3 py-3 text-right num">{op.count}</td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtTokens(op.inputTokens)}
                    </td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtTokens(op.outputTokens)}
                    </td>
                    <td className="px-3 py-3 text-right num">{fmtCost(op.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {usage && usage.recentActivity.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("usage.recentTitle")}
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("usage.recentColumns.time")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("usage.recentColumns.user")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("usage.recentColumns.operation")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.recentColumns.tokens")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("usage.recentColumns.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.recentActivity.map((a) => (
                  <tr key={a._id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {new Date(a.createdAt).toLocaleString(dateLocale)}
                    </td>
                    <td className="px-3 py-3 text-xs">{a.userEmail || "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs">{a.operation}</td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtTokens(a.inputTokens + a.outputTokens)}
                    </td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtCost(a.estimatedCostUSD)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card p-4 ${
        highlight ? "border-[var(--red)]/40 bg-red-500/5" : ""
      }`}
    >
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div
        className={`text-xl font-semibold num ${
          highlight ? "text-[var(--red)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function QuoteProvidersCard({
  providers,
  saving,
  onSave,
}: {
  providers: QuoteProvidersConfig;
  saving: boolean;
  onSave: (patch: {
    order?: QuoteProviderKey[];
    yahooEnabled?: boolean;
    finnhubEnabled?: boolean;
    stooqEnabled?: boolean;
    finnhubApiKey?: string;
  }) => void;
}) {
  const t = useTranslations("Admin.quoteProviders");
  const tCommon = useTranslations("Admin.common");
  const [order, setOrder] = useState<QuoteProviderKey[]>(providers.order);
  const [yahooEnabled, setYahooEnabled] = useState(providers.yahooEnabled);
  const [finnhubEnabled, setFinnhubEnabled] = useState(providers.finnhubEnabled);
  const [stooqEnabled, setStooqEnabled] = useState(providers.stooqEnabled);
  const [finnhubKey, setFinnhubKey] = useState("");

  useEffect(() => {
    setOrder(providers.order);
    setYahooEnabled(providers.yahooEnabled);
    setFinnhubEnabled(providers.finnhubEnabled);
    setStooqEnabled(providers.stooqEnabled);
  }, [providers]);

  function move(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  }

  const dirty =
    JSON.stringify(order) !== JSON.stringify(providers.order) ||
    yahooEnabled !== providers.yahooEnabled ||
    finnhubEnabled !== providers.finnhubEnabled ||
    stooqEnabled !== providers.stooqEnabled ||
    finnhubKey.trim().length > 0;

  const enabledMap: Record<QuoteProviderKey, boolean> = {
    yahoo: yahooEnabled,
    finnhub: finnhubEnabled,
    stooq: stooqEnabled,
  };
  const setEnabled = (p: QuoteProviderKey, v: boolean) => {
    if (p === "yahoo") setYahooEnabled(v);
    else if (p === "finnhub") setFinnhubEnabled(v);
    else setStooqEnabled(v);
  };

  const anyEnabled = yahooEnabled || finnhubEnabled || stooqEnabled;
  const finnhubNeedsKey = finnhubEnabled && !providers.finnhubKey.set && finnhubKey.trim() === "";

  function handleSave() {
    const patch: Parameters<typeof onSave>[0] = {
      order,
      yahooEnabled,
      finnhubEnabled,
      stooqEnabled,
    };
    if (finnhubKey.trim().length > 0) patch.finnhubApiKey = finnhubKey.trim();
    onSave(patch);
    setFinnhubKey("");
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LayersIcon size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p
        className="text-xs text-[var(--muted)]"
        dangerouslySetInnerHTML={{ __html: t.raw("body") as string }}
      />

      {!anyEnabled && (
        <div
          role="alert"
          className="text-xs text-[var(--red)] border border-[var(--red)]/40 bg-red-500/10 rounded p-2"
        >
          {t("noneActive")}
        </div>
      )}

      <ol className="space-y-2">
        {order.map((p, idx) => {
          const isEnabled = enabledMap[p];
          const providerLabel = t(`providerLabels.${p}`);
          return (
            <li
              key={p}
              className={`border rounded-lg p-3 flex items-start gap-3 ${
                isEnabled
                  ? "border-[var(--border)]"
                  : "border-[var(--border)] opacity-50"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 text-[var(--muted)] hover:text-white disabled:opacity-30"
                  aria-label={t("moveUp", { label: providerLabel })}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === order.length - 1}
                  className="p-1 text-[var(--muted)] hover:text-white disabled:opacity-30"
                  aria-label={t("moveDown", { label: providerLabel })}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="num text-xs text-[var(--muted)]">#{idx + 1}</span>
                  <span className="font-medium">{providerLabel}</span>
                  {p === "finnhub" && providers.finnhubKey.set && (
                    <span className="text-[10px] text-[var(--green)]">
                      {t("keyConfigured", { hint: providers.finnhubKey.hint })}
                    </span>
                  )}
                  {p === "finnhub" && !providers.finnhubKey.set && finnhubEnabled && (
                    <span className="text-[10px] text-yellow-400">
                      {t("keyMissing")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  {t(`providerNotes.${p}`)}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setEnabled(p, e.target.checked)}
                  className="w-4 h-4"
                />
                {isEnabled ? t("active") : t("off")}
              </label>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-[var(--border)] pt-3 space-y-2">
        <label
          htmlFor="finnhub-key"
          className="block text-xs font-medium text-[var(--muted)]"
        >
          {t("finnhubKey")}
        </label>
        <input
          id="finnhub-key"
          type="password"
          value={finnhubKey}
          onChange={(e) => setFinnhubKey(e.target.value)}
          placeholder={
            providers.finnhubKey.set
              ? t("finnhubKeyPlaceholderNew", { hint: providers.finnhubKey.hint })
              : t("finnhubKeyPlaceholderEmpty")
          }
          className="input"
          autoComplete="off"
        />
        {finnhubNeedsKey && (
          <div className="text-xs text-yellow-400">
            {t("finnhubMissingNote")}
          </div>
        )}
        <div className="text-[10px] text-[var(--muted)]">
          {t("finnhubRegister")}{" "}
          <a
            href="https://finnhub.io/register"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            finnhub.io
          </a>
          {t("finnhubRegisterRest")}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function MoversAutoScanCard({
  config,
  finnhubKeySet,
  saving,
  onSave,
}: {
  config: MoversAutoScanConfig;
  finnhubKeySet: boolean;
  saving: boolean;
  onSave: (patch: Partial<MoversAutoScanConfig>) => void;
}) {
  const t = useTranslations("Admin.moversAutoScan");
  const tCommon = useTranslations("Admin.common");
  const [enabled, setEnabled] = useState(config.enabled);
  const [provider, setProvider] = useState<MoversAutoScanConfig["provider"]>(
    config.provider
  );
  const [intervalStr, setIntervalStr] = useState(String(config.intervalMinutes));
  const [tradingOnly, setTradingOnly] = useState(config.tradingHoursOnly);

  useEffect(() => {
    setEnabled(config.enabled);
    setProvider(config.provider);
    setIntervalStr(String(config.intervalMinutes));
    setTradingOnly(config.tradingHoursOnly);
  }, [config]);

  const intervalNum = Number(intervalStr);
  const intervalValid =
    Number.isFinite(intervalNum) && Number.isInteger(intervalNum) && intervalNum >= 5;
  const dirty =
    enabled !== config.enabled ||
    provider !== config.provider ||
    (intervalValid && intervalNum !== config.intervalMinutes) ||
    tradingOnly !== config.tradingHoursOnly;

  const finnhubMissing = provider === "finnhub" && !finnhubKeySet;

  function save() {
    onSave({
      enabled,
      provider,
      intervalMinutes: intervalValid ? intervalNum : config.intervalMinutes,
      tradingHoursOnly: tradingOnly,
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Timer size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p
        className="text-xs text-[var(--muted)]"
        dangerouslySetInnerHTML={{ __html: t.raw("body") as string }}
      />

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4"
        />
        <span>{enabled ? t("enabled") : t("disabled")}</span>
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("provider")}
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as "yahoo" | "finnhub")}
            className="input"
            disabled={!enabled}
          >
            <option value="yahoo">{t("providerYahoo")}</option>
            <option value="finnhub">{t("providerFinnhub")}</option>
          </select>
          {finnhubMissing && (
            <div className="text-xs text-yellow-400 mt-1">
              {t("finnhubMissingWarn")}
            </div>
          )}
          {provider === "finnhub" && !finnhubMissing && (
            <div className="text-[10px] text-[var(--muted)] mt-1">
              {t("finnhubSlowNote")}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="movers-interval" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("interval")}
          </label>
          <input
            id="movers-interval"
            type="number"
            min={5}
            step={5}
            value={intervalStr}
            onChange={(e) => setIntervalStr(e.target.value)}
            className="input num"
            disabled={!enabled}
          />
          {!intervalValid && (
            <div className="text-xs text-[var(--red)] mt-1">
              {t("intervalTooSmall")}
            </div>
          )}
          <div className="text-[10px] text-[var(--muted)] mt-1">
            {t("intervalHint")}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          checked={tradingOnly}
          onChange={(e) => setTradingOnly(e.target.checked)}
          disabled={!enabled}
          className="w-4 h-4"
        />
        <span>{t("tradingOnly")}</span>
      </label>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty || !intervalValid}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function YahooQuotaCard({
  initialLimit,
  quota,
  saving,
  onSave,
  dateLocale,
}: {
  initialLimit: number;
  quota?: YahooQuotaStatus;
  saving: boolean;
  onSave: (limit: number) => void;
  dateLocale: string;
}) {
  const t = useTranslations("Admin.yahooQuota");
  const tCommon = useTranslations("Admin.common");
  const [limitStr, setLimitStr] = useState(String(initialLimit));

  useEffect(() => {
    setLimitStr(String(initialLimit));
  }, [initialLimit]);

  const parsed = Number(limitStr);
  const valid = Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed);
  const dirty = valid && parsed !== initialLimit;

  const percent = quota?.percentUsed ?? null;
  const hitToday = !!quota?.lastLimitHitAt;
  const usageColor =
    percent == null
      ? "text-[var(--muted)]"
      : percent >= 100
        ? "text-[var(--red)]"
        : percent >= 80
          ? "text-yellow-400"
          : "text-[var(--green)]";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p
        className="text-xs text-[var(--muted)]"
        dangerouslySetInnerHTML={{ __html: t.raw("body") as string }}
      />

      {quota && (
        <div className="grid sm:grid-cols-3 gap-3 text-sm border border-[var(--border)] rounded-lg p-3">
          <div>
            <div className="text-xs text-[var(--muted)]">{t("usedToday")}</div>
            <div className={`text-xl num font-semibold ${usageColor}`}>
              {quota.usedToday.toLocaleString(dateLocale)}
              {quota.limit > 0 && (
                <span className="text-[var(--muted)] text-sm font-normal">
                  {" / "}
                  {quota.limit.toLocaleString(dateLocale)}
                </span>
              )}
            </div>
            {percent != null && (
              <div className="h-1 rounded-full mt-2 bg-[var(--surface-2)]" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${
                    percent >= 100
                      ? "bg-[var(--red)]"
                      : percent >= 80
                        ? "bg-yellow-400"
                        : "bg-[var(--green)]"
                  }`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">{t("remainingToday")}</div>
            <div className="text-xl num font-semibold">
              {quota.remaining == null
                ? t("unlimited")
                : quota.remaining.toLocaleString(dateLocale)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">{t("lastHit")}</div>
            <div className={`text-sm ${hitToday ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
              {quota.lastLimitHitAt
                ? new Date(quota.lastLimitHitAt).toLocaleString(dateLocale)
                : "—"}
            </div>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="yahoo-limit" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
          {t("limitLabel")}
        </label>
        <input
          id="yahoo-limit"
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={limitStr}
          onChange={(e) => setLimitStr(e.target.value)}
          className="input num w-48"
        />
        {!valid && (
          <div className="text-xs text-[var(--red)] mt-1">
            {t("invalid")}
          </div>
        )}
        <div
          className="text-[10px] text-[var(--muted)] mt-1"
          dangerouslySetInnerHTML={{ __html: t.raw("hint") as string }}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => valid && onSave(parsed)}
          disabled={saving || !dirty || !valid}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function LoginNoticeCard({
  initialText,
  initialEnabled,
  saving,
  onSave,
}: {
  initialText: string;
  initialEnabled: boolean;
  saving: boolean;
  onSave: (text: string, enabled: boolean) => void;
}) {
  const t = useTranslations("Admin.overview.loginNotice");
  const tCommon = useTranslations("Admin.common");
  const [text, setText] = useState(initialText);
  const [enabled, setEnabled] = useState(initialEnabled);

  // Initialwerte aktualisieren, wenn sich die Settings ändern (z.B. nach Load)
  useEffect(() => {
    setText(initialText);
  }, [initialText]);
  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const dirty = text !== initialText || enabled !== initialEnabled;
  const MAX = 2000;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-[var(--muted)]">{t("body")}</p>

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4"
        />
        <span>{enabled ? t("enabled") : t("disabled")}</span>
      </label>

      <div>
        <label htmlFor="login-notice-text" className="sr-only">
          {t("textLabel")}
        </label>
        <textarea
          id="login-notice-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          rows={5}
          maxLength={MAX}
          placeholder={t("placeholder")}
          className="input font-sans"
        />
        <div className="text-[10px] text-[var(--muted)] mt-1 text-right">
          {text.length} / {MAX}
        </div>
      </div>

      {text.trim().length > 0 && (
        <div className="border border-[var(--border)] rounded p-3 bg-[var(--surface-2)]/40">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
            {t("preview")}
          </div>
          <div className="text-sm whitespace-pre-line">{text}</div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => onSave(text, enabled)}
          disabled={saving || !dirty}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function DataSourcesCard({
  dataSources,
  saving,
  onSave,
}: {
  dataSources?: DataSourcesConfig;
  saving: boolean;
  onSave: (patch: {
    fredApiKey?: string;
    secUserAgent?: string;
    redditClientId?: string;
    redditClientSecret?: string;
  }) => void;
}) {
  const t = useTranslations("Admin.dataSources");
  const tCommon = useTranslations("Admin.common");
  const [fredKey, setFredKey] = useState("");
  const [userAgent, setUserAgent] = useState(dataSources?.secUserAgent || "");
  const [redditClientId, setRedditClientId] = useState(
    dataSources?.redditClientId || ""
  );
  const [redditClientSecret, setRedditClientSecret] = useState("");

  useEffect(() => {
    setUserAgent(dataSources?.secUserAgent || "");
  }, [dataSources?.secUserAgent]);
  useEffect(() => {
    setRedditClientId(dataSources?.redditClientId || "");
  }, [dataSources?.redditClientId]);

  const dirty =
    fredKey.trim().length > 0 ||
    userAgent.trim() !== (dataSources?.secUserAgent || "").trim() ||
    redditClientId.trim() !== (dataSources?.redditClientId || "").trim() ||
    redditClientSecret.trim().length > 0;

  function handleSave() {
    const patch: Parameters<typeof onSave>[0] = {};
    if (fredKey.trim().length > 0) patch.fredApiKey = fredKey.trim();
    if (userAgent.trim() !== (dataSources?.secUserAgent || "").trim()) {
      patch.secUserAgent = userAgent.trim();
    }
    if (redditClientId.trim() !== (dataSources?.redditClientId || "").trim()) {
      patch.redditClientId = redditClientId.trim();
    }
    if (redditClientSecret.trim().length > 0) {
      patch.redditClientSecret = redditClientSecret.trim();
    }
    if (Object.keys(patch).length === 0) return;
    onSave(patch);
    setFredKey("");
    setRedditClientSecret("");
  }

  const fredKeySet = !!dataSources?.fredKey?.set;
  const redditSecretSet = !!dataSources?.redditClientSecret?.set;

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Database size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-[var(--muted)]">{t("body")}</p>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t("fredTitle")}</div>
        <div className="text-xs text-[var(--muted)]">
          {t("fredBody")}{" "}
          <a
            href="https://fred.stlouisfed.org/docs/api/api_key.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            fred.stlouisfed.org
          </a>
          .
        </div>
        {fredKeySet && (
          <div className="inline-flex items-center gap-1.5 text-xs text-[var(--green)]">
            <CheckCircle2 size={12} aria-hidden="true" />
            {t("fredKeyConfigured", { hint: dataSources?.fredKey.hint ?? "" })}
          </div>
        )}
        <input
          type="password"
          value={fredKey}
          onChange={(e) => setFredKey(e.target.value)}
          placeholder={fredKeySet ? t("fredPlaceholderNew") : t("fredPlaceholderEmpty")}
          className="input"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2 pt-3 border-t border-[var(--border)]">
        <div className="text-sm font-medium">{t("secTitle")}</div>
        <div className="text-xs text-[var(--muted)]">
          {t("secBody1")}{" "}
          <code className="text-[var(--foreground)]">{t("secExample")}</code>
          {t("secBody2")}
        </div>
        <input
          type="text"
          value={userAgent}
          onChange={(e) => setUserAgent(e.target.value)}
          placeholder={t("secPlaceholder")}
          className="input"
          maxLength={200}
        />
      </div>

      <div className="space-y-2 pt-3 border-t border-[var(--border)]">
        <div className="text-sm font-medium">{t("redditTitle")}</div>
        <div className="text-xs text-[var(--muted)]">
          {t("redditBody")}{" "}
          <a
            href="https://www.reddit.com/prefs/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            reddit.com/prefs/apps
          </a>
          <span dangerouslySetInnerHTML={{ __html: t.raw("redditBodyRest") as string }} />
        </div>
        <input
          type="text"
          value={redditClientId}
          onChange={(e) => setRedditClientId(e.target.value)}
          placeholder={t("redditClientIdPlaceholder")}
          className="input"
          maxLength={100}
          autoComplete="off"
        />
        {redditSecretSet && (
          <div className="inline-flex items-center gap-1.5 text-xs text-[var(--green)]">
            <CheckCircle2 size={12} aria-hidden="true" />
            {t("redditSecretConfigured", { hint: dataSources?.redditClientSecret.hint ?? "" })}
          </div>
        )}
        <input
          type="password"
          value={redditClientSecret}
          onChange={(e) => setRedditClientSecret(e.target.value)}
          placeholder={
            redditSecretSet ? t("redditSecretPlaceholderNew") : t("redditSecretPlaceholderEmpty")
          }
          className="input"
          autoComplete="off"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}

function AutoUpdateCard({
  config,
  saving,
  onSave,
  onTrigger,
  dateLocale,
}: {
  config: AutoUpdateConfig;
  saving: boolean;
  onSave: (patch: { enabled?: boolean; intervalMinutes?: number }) => void;
  onTrigger: () => void;
  dateLocale: string;
}) {
  const t = useTranslations("Admin.autoUpdate");
  const tCommon = useTranslations("Admin.common");
  const [enabled, setEnabled] = useState(config.enabled);
  const [intervalStr, setIntervalStr] = useState(String(config.intervalMinutes));

  useEffect(() => {
    setEnabled(config.enabled);
    setIntervalStr(String(config.intervalMinutes));
  }, [config]);

  const intervalNum = Number(intervalStr);
  const intervalValid =
    Number.isFinite(intervalNum) &&
    Number.isInteger(intervalNum) &&
    intervalNum >= 5 &&
    intervalNum <= 1440;
  const dirty =
    enabled !== config.enabled ||
    (intervalValid && intervalNum !== config.intervalMinutes);

  function handleSave() {
    onSave({
      enabled,
      intervalMinutes: intervalValid ? intervalNum : config.intervalMinutes,
    });
  }

  const lastRunLabel = config.lastRunAt
    ? new Date(config.lastRunAt).toLocaleString(dateLocale)
    : "—";
  const lastDurationLabel =
    typeof config.lastDurationMs === "number" && config.lastDurationMs > 0
      ? `${(config.lastDurationMs / 1000).toFixed(1)} s`
      : "—";
  const lastTickerLabel =
    typeof config.lastTickerCount === "number"
      ? fmtNumber(config.lastTickerCount, dateLocale, 0)
      : "—";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p
        className="text-xs text-[var(--muted)]"
        dangerouslySetInnerHTML={{ __html: t.raw("body") as string }}
      />

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4"
        />
        <span>{enabled ? t("enabled") : t("disabled")}</span>
      </label>

      <div>
        <label
          htmlFor="autoupdate-interval"
          className="block text-xs font-medium text-[var(--muted)] mb-1.5"
        >
          {t("interval")}
        </label>
        <input
          id="autoupdate-interval"
          type="number"
          min={5}
          max={1440}
          step={5}
          value={intervalStr}
          onChange={(e) => setIntervalStr(e.target.value)}
          className="input num w-48"
          disabled={!enabled}
        />
        {!intervalValid && (
          <div className="text-xs text-[var(--red)] mt-1">
            {t("intervalRange")}
          </div>
        )}
        <div className="text-[10px] text-[var(--muted)] mt-1">
          {t("intervalHint")}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-sm border border-[var(--border)] rounded-lg p-3">
        <div>
          <div className="text-xs text-[var(--muted)]">{t("lastRun")}</div>
          <div className="text-sm font-medium">{lastRunLabel}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">{t("lastDuration")}</div>
          <div className="text-sm font-medium num">{lastDurationLabel}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">{t("lastTickers")}</div>
          <div className="text-sm font-medium num">{lastTickerLabel}</div>
        </div>
      </div>

      <div className="flex justify-end gap-2 flex-wrap">
        <button
          onClick={onTrigger}
          disabled={saving}
          className="btn text-sm"
          title={t("triggerTitle")}
        >
          {saving ? <div className="spinner" /> : <RefreshCw size={13} aria-hidden="true" />}
          {t("trigger")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !intervalValid}
          className="btn btn-primary text-sm"
        >
          {saving ? <div className="spinner" /> : <Save size={13} aria-hidden="true" />}
          {tCommon("save")}
        </button>
      </div>
    </div>
  );
}
