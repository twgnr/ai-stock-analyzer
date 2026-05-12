"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  AlertCircle,
  Globe2,
  User as UserIcon,
  Building2,
  Layers,
  Sprout,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TickerLink } from "@/components/TickerLink";

interface ThemeTicker {
  ticker: string;
  name: string;
  marketCapUsd: number;
  currency: string;
  rationale: string;
}

interface ThemeDetail {
  _id: string;
  name: string;
  description: string;
  isGlobal: boolean;
  isOwn: boolean;
  canEdit: boolean;
  bigPlayers: ThemeTicker[];
  midPlayers: ThemeTicker[];
  smallPlayers: ThemeTicker[];
  generatedAt: string;
  generationModel: string;
  updatedAt: string;
}

function fmtMarketCapUsd(usd: number): string {
  if (usd >= 1_000_000_000_000) return `${(usd / 1_000_000_000_000).toFixed(2)} Bio. $`;
  if (usd >= 1_000_000_000) return `${(usd / 1_000_000_000).toFixed(2)} Mrd. $`;
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(0)} Mio. $`;
  return `${usd.toFixed(0)} $`;
}

export default function ThemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("Themes.detail");
  const tCommon = useTranslations("Themes.common");
  const locale = useLocale();
  const format = useFormatter();
  const [data, setData] = useState<ThemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/${id}`);
      if (res.status === 401) {
        window.location.href = `/${locale}/login`;
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || tCommon("error"));
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [id, locale, tCommon]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    if (!data?.canEdit) return;
    if (!confirm(t("confirmRefresh"))) {
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/${id}/refresh`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || tCommon("error"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setRefreshing(false);
    }
  }

  async function deleteBasket() {
    if (!data?.canEdit) return;
    if (!confirm(t("confirmDelete", { name: data.name }))) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tCommon("error"));
      }
      window.location.href = `/${locale}/themes`;
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
      setDeleting(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-[var(--muted)]">{tCommon("loading")}</div>;
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Link href="/themes" className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1">
          <ArrowLeft size={14} />
          {t("back")}
        </Link>
        {error && (
          <div role="alert" className="card p-3 text-[var(--red)] text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/themes"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} />
        {t("back")}
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {data.name}
            {data.isGlobal ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] border border-[var(--accent)]/30 rounded px-2 py-0.5"
                title={t("defaultTitle")}
              >
                <Globe2 size={11} aria-hidden="true" />
                {t("default")}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs text-[var(--muted)] border border-[var(--border)] rounded px-2 py-0.5"
                title={t("ownTitle")}
              >
                <UserIcon size={11} aria-hidden="true" />
                {t("own")}
              </span>
            )}
          </h1>
          {data.description && (
            <p className="text-sm text-[var(--muted)] max-w-3xl">{data.description}</p>
          )}
          <div className="text-[10px] text-[var(--muted)]">
            {t("generated", {
              date: format.dateTime(new Date(data.generatedAt), {
                dateStyle: "short",
                timeStyle: "short",
              }),
            })}
            {data.generationModel && <> · {data.generationModel}</>}
          </div>
        </div>

        {data.canEdit && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={refresh}
              disabled={refreshing || deleting}
              className="btn"
              title={t("refreshTitle")}
            >
              {refreshing ? (
                <div className="spinner" />
              ) : (
                <RefreshCw size={14} aria-hidden="true" />
              )}
              {refreshing ? t("refreshing") : t("refresh")}
            </button>
            <button
              onClick={deleteBasket}
              disabled={refreshing || deleting}
              className="btn"
              title={t("deleteTitle")}
            >
              {deleting ? (
                <div className="spinner" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              {t("delete")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <BucketColumn
          icon={<Building2 size={16} aria-hidden="true" />}
          title={t("bucketBig")}
          subtitle={t("bucketBigSubtitle")}
          emptyLabel={t("bucketEmpty")}
          tickers={data.bigPlayers}
        />
        <BucketColumn
          icon={<Layers size={16} aria-hidden="true" />}
          title={t("bucketMid")}
          subtitle={t("bucketMidSubtitle")}
          emptyLabel={t("bucketEmpty")}
          tickers={data.midPlayers}
        />
        <BucketColumn
          icon={<Sprout size={16} aria-hidden="true" />}
          title={t("bucketSmall")}
          subtitle={t("bucketSmallSubtitle")}
          emptyLabel={t("bucketEmpty")}
          tickers={data.smallPlayers}
        />
      </div>
    </div>
  );
}

function BucketColumn({
  icon,
  title,
  subtitle,
  emptyLabel,
  tickers,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  emptyLabel: string;
  tickers: ThemeTicker[];
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent)]">{icon}</span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <span className="text-[10px] text-[var(--muted)] num">
          {subtitle} · {tickers.length}
        </span>
      </div>
      {tickers.length === 0 ? (
        <div className="text-sm text-[var(--muted)] italic">{emptyLabel}</div>
      ) : (
        <ul className="space-y-2">
          {tickers.map((t) => (
            <li
              key={t.ticker}
              className="border border-[var(--border)] rounded-lg p-3 hover:border-[var(--accent)]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <TickerLink ticker={t.ticker} className="font-semibold">
                    <span>{t.ticker}</span>
                  </TickerLink>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {t.name}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--muted)] num text-right flex-shrink-0">
                  {fmtMarketCapUsd(t.marketCapUsd)}
                </div>
              </div>
              {t.rationale && (
                <p className="text-xs text-[var(--muted)] mt-1.5 line-clamp-3">
                  {t.rationale}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
