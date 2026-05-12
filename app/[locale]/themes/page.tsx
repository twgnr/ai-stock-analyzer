"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import {
  Sparkles,
  Plus,
  RefreshCw,
  AlertCircle,
  Globe2,
  User as UserIcon,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

interface ThemeListItem {
  _id: string;
  name: string;
  description: string;
  isGlobal: boolean;
  isOwn: boolean;
  counts: { big: number; mid: number; small: number };
  generatedAt: string;
  updatedAt: string;
}

interface CurrentUser {
  role: "user" | "admin";
}

const PRESET_KEYS = [
  "aiSemis",
  "energy",
  "defense",
  "robotics",
  "cybersecurity",
  "demographics",
  "water",
  "cloud",
] as const;

export default function ThemesPage() {
  const t = useTranslations("Themes.list");
  const tCommon = useTranslations("Themes.common");
  const locale = useLocale();
  const format = useFormatter();
  const [items, setItems] = useState<ThemeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"user" | "global">("user");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/themes");
      if (res.status === 401) {
        window.location.href = `/${locale}/login`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [locale, tCommon]);

  useEffect(() => {
    void load();
    // Rolle für Admin-Default-Optionen besorgen — endet auf 401 ist okay,
    // dann gibt es eh keinen User.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setMe({ role: d.user.role }))
      .catch(() => {});
  }, [load]);

  async function createBasket() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setName("");
      setDescription("");
      setScope("user");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers size={22} className="text-[var(--accent)]" aria-hidden="true" />
          {t("title")}
        </h1>
        <button onClick={load} className="btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      <p className="text-sm text-[var(--muted)] max-w-3xl">
        {t.rich("intro", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="card p-4 space-y-3" data-help="theme-create">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">{t("createTitle")}</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">{t("createHint")}</p>

        <div>
          <label htmlFor="theme-name" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("nameLabel")}
          </label>
          <input
            id="theme-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            maxLength={120}
            placeholder={t("namePlaceholder")}
            className="input"
            disabled={creating}
          />
        </div>

        <div>
          <label
            htmlFor="theme-description"
            className="block text-xs font-medium text-[var(--muted)] mb-1.5"
          >
            {t("descriptionLabel")}
          </label>
          <textarea
            id="theme-description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 600))}
            maxLength={600}
            rows={2}
            placeholder={t("descriptionPlaceholder")}
            className="input font-sans"
            disabled={creating}
          />
        </div>

        {me?.role === "admin" && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--muted)]">{t("visibility")}</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="radio"
                name="scope"
                value="user"
                checked={scope === "user"}
                onChange={() => setScope("user")}
                disabled={creating}
              />
              <UserIcon size={12} aria-hidden="true" />
              {t("scopeUser")}
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="radio"
                name="scope"
                value="global"
                checked={scope === "global"}
                onChange={() => setScope("global")}
                disabled={creating}
              />
              <Globe2 size={12} aria-hidden="true" />
              {t("scopeGlobal")}
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_KEYS.map((key) => {
              const label = t(`presets.${key}` as `presets.${typeof PRESET_KEYS[number]}`);
              return (
                <button
                  key={key}
                  onClick={() => !creating && setName(label)}
                  disabled={creating}
                  className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-colors"
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={createBasket}
            disabled={creating || !name.trim()}
            className="btn btn-primary"
          >
            {creating ? <div className="spinner" /> : <Plus size={14} aria-hidden="true" />}
            {creating ? t("creating") : t("create")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">{tCommon("loading")}</div>
      ) : items.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)] text-center">{t("empty")}</div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((b) => (
            <li key={b._id}>
              <Link
                href={`/themes/${b._id}`}
                className="card card-hover p-4 flex flex-col h-full gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold flex-1 min-w-0">{b.name}</div>
                  {b.isGlobal ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-[var(--accent)] flex-shrink-0"
                      title={t("defaultTitle")}
                    >
                      <Globe2 size={10} aria-hidden="true" />
                      {t("default")}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-[var(--muted)] flex-shrink-0"
                      title={t("ownTitle")}
                    >
                      <UserIcon size={10} aria-hidden="true" />
                      {t("own")}
                    </span>
                  )}
                </div>
                {b.description && (
                  <p className="text-xs text-[var(--muted)] line-clamp-2">
                    {b.description}
                  </p>
                )}
                <div className="flex gap-2 text-[10px] text-[var(--muted)] mt-auto pt-2 border-t border-[var(--border)]">
                  <span title={t("bigTitle")}>
                    {t("big")} <span className="num text-[var(--foreground)]">{b.counts.big}</span>
                  </span>
                  <span title={t("midTitle")}>
                    {t("mid")} <span className="num text-[var(--foreground)]">{b.counts.mid}</span>
                  </span>
                  <span title={t("smallTitle")}>
                    {t("small")} <span className="num text-[var(--foreground)]">{b.counts.small}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-0.5">
                    {t("view")} <ArrowRight size={10} aria-hidden="true" />
                  </span>
                </div>
                <div className="text-[10px] text-[var(--muted)]">
                  {t("generated", {
                    date: format.dateTime(new Date(b.generatedAt), { dateStyle: "short" }),
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
