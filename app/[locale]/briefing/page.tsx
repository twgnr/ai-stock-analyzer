"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Newspaper,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { fmtPercent } from "@/lib/format";
import { SkeletonCardList, SkeletonStatGrid } from "@/components/Skeleton";
import { ageHighlightClass } from "@/lib/storage";

interface Mover {
  ticker: string;
  name?: string;
  weekChangePct: number;
  inPortfolio: boolean;
}

interface NewsItem {
  ticker: string;
  title: string;
  publisher: string;
  publishedAt: string;
  link: string;
}

interface AtRisk {
  ticker: string;
  status: string;
  verdict?: string;
  checkedAt?: string;
}

interface Unchecked {
  ticker: string;
  createdAt: string;
}

interface Payload {
  generatedAt: string;
  positions: number;
  watchlist: number;
  topGainers: Mover[];
  topLosers: Mover[];
  news: NewsItem[];
  thesenAtRisk: AtRisk[];
  thesenUnchecked: Unchecked[];
  message?: string;
}

export default function BriefingPage() {
  const t = useTranslations("Briefing");
  const locale = useLocale();
  const localeForTime = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/briefing/weekly");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("errorGeneric"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("back")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-[var(--accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <button onClick={load} disabled={loading} className="btn text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {t("refresh")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("description")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--muted)] flex items-center gap-2">
            <span className="spinner" />
            {t("loading")}
          </p>
          <SkeletonStatGrid count={4} />
          <SkeletonCardList count={3} />
        </div>
      )}

      {data?.message && (
        <div className="card p-8 text-center text-[var(--muted)]">{data.message}</div>
      )}

      {data && !data.message && (
        <>
          <div
            className={`text-xs ${
              ageHighlightClass(data.generatedAt) || "text-[var(--muted)]"
            }`}
          >
            {t("generated", {
              time: new Date(data.generatedAt).toLocaleString(localeForTime),
              positions: data.positions,
              watchlist: data.watchlist,
            })}
          </div>

          {(data.thesenAtRisk.length > 0 || data.thesenUnchecked.length > 0) && (
            <ThesenAlert atRisk={data.thesenAtRisk} unchecked={data.thesenUnchecked} />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <MoverList
              title={t("movers.topGainers")}
              items={data.topGainers}
              tone="green"
              icon={<TrendingUp size={14} className="text-[var(--green)]" aria-hidden="true" />}
              emptyText={t("movers.empty")}
              portfolioLabel={t("movers.portfolioBadge")}
            />
            <MoverList
              title={t("movers.topLosers")}
              items={data.topLosers}
              tone="red"
              icon={<TrendingDown size={14} className="text-[var(--red)]" aria-hidden="true" />}
              emptyText={t("movers.empty")}
              portfolioLabel={t("movers.portfolioBadge")}
            />
          </div>

          {data.news.length > 0 && <NewsList news={data.news} locale={localeForTime} newsHeading={t("newsHeading")} />}
        </>
      )}
    </div>
  );
}

function ThesenAlert({ atRisk, unchecked }: { atRisk: AtRisk[]; unchecked: Unchecked[] }) {
  const t = useTranslations("Briefing.thesenAlert");
  return (
    <div className="card p-4 space-y-2 border border-yellow-500/30 bg-yellow-500/5">
      <h2 className="font-semibold flex items-center gap-2 text-yellow-400">
        <AlertTriangle size={16} aria-hidden="true" /> {t("title")}
      </h2>
      {atRisk.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
            {t("atRiskHeading")}
          </div>
          {atRisk.map((th) => (
            <div key={th.ticker} className="text-sm flex items-start gap-2">
              <Link
                href={`/analysis/${encodeURIComponent(th.ticker)}`}
                className="font-semibold hover:text-[var(--accent)]"
              >
                {th.ticker}
              </Link>
              <span className="text-[var(--muted)]">—</span>
              <span className="flex-1">{th.verdict || th.status}</span>
            </div>
          ))}
        </div>
      )}
      {unchecked.length > 0 && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--muted)] mb-1">
            {unchecked.length === 1
              ? t("uncheckedOne", { count: unchecked.length })
              : t("uncheckedOther", { count: unchecked.length })}
          </div>
          <div className="flex flex-wrap gap-1">
            {unchecked.map((th) => (
              <Link
                key={th.ticker}
                href={`/analysis/${encodeURIComponent(th.ticker)}`}
                className="text-xs border border-[var(--border)] rounded px-2 py-0.5 hover:bg-[var(--surface-2)]"
              >
                {th.ticker}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MoverList({
  title,
  items,
  tone,
  icon,
  emptyText,
  portfolioLabel,
}: {
  title: string;
  items: Mover[];
  tone: "green" | "red";
  icon: React.ReactNode;
  emptyText: string;
  portfolioLabel: string;
}) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-2 flex items-center gap-2">{icon}{title}</h2>
      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((m) => (
            <div
              key={m.ticker}
              className="flex items-center justify-between border-b border-[var(--border)] last:border-b-0 py-1"
            >
              <div>
                <Link
                  href={`/analysis/${encodeURIComponent(m.ticker)}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {m.ticker}
                </Link>
                {m.inPortfolio && (
                  <span className="text-[10px] text-[var(--accent)] ml-2">{portfolioLabel}</span>
                )}
                {m.name && (
                  <div className="text-[10px] text-[var(--muted)] truncate max-w-[200px]">
                    {m.name}
                  </div>
                )}
              </div>
              <div
                className={`num font-semibold ${
                  tone === "green" ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {m.weekChangePct > 0 ? "+" : ""}
                {fmtPercent(m.weekChangePct)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsList({ news, locale, newsHeading }: { news: NewsItem[]; locale: string; newsHeading: string }) {
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Newspaper size={16} className="text-[var(--accent)]" aria-hidden="true" />
        {newsHeading}
      </h2>
      <div className="space-y-2">
        {news.map((n, i) => (
          <a
            key={`${n.ticker}-${i}`}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-b border-[var(--border)] last:border-b-0 pb-2 last:pb-0 hover:text-[var(--accent)]"
          >
            <div className="text-xs text-[var(--muted)] flex items-center gap-2">
              <span className="font-medium">{n.ticker}</span>
              <span>·</span>
              <span>{n.publisher}</span>
              <span>·</span>
              <span>{new Date(n.publishedAt).toLocaleDateString(locale)}</span>
            </div>
            <div className="text-sm">{n.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
