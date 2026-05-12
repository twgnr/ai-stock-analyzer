"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import {
  ArrowLeft,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  AlertCircle,
  Trash2,
  Mail,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtPercent } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

interface TickerItem {
  ticker: string;
  name?: string;
  relevance: number;
  impact: "positive" | "negative" | "neutral";
  summary: string;
  keyFacts: string[];
  priceChangePct?: number;
}

interface Detail {
  _id: string;
  headline: string;
  summary: string;
  marketOverview: string;
  perTicker: TickerItem[];
  upcomingEvents: string[];
  watchNext: string[];
  periodDays: number;
  tickers: string[];
  model?: string;
  mailedAt?: string;
  createdAt: string;
}

export default function NewsDigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("NewsDigest.detail");
  const tCommon = useTranslations("NewsDigest.common");
  const locale = useLocale();
  const format = useFormatter();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news-digest/${id}`);
      if (res.status === 401) {
        window.location.href = `/${locale}/login`;
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [id, locale, tCommon]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/news-digest/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error);
      }
      window.location.href = `/${locale}/news-digest`;
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        <div className="spinner mb-2" />
        {tCommon("loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="card p-4 text-[var(--red)] flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  if (!data) return null;

  const sortedTicker = [...data.perTicker].sort((a, b) => b.relevance - a.relevance);

  return (
    <div className="space-y-6">
      <Link
        href="/news-digest"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Newspaper size={20} className="text-[var(--accent)]" />
              <h1 className="text-2xl font-semibold">{data.headline}</h1>
            </div>
            <div className="text-xs text-[var(--muted)] mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span>{t("period", { days: data.periodDays })}</span>
              <span>{t("tickersAnalyzed", { count: data.tickers.length })}</span>
              <span className={ageHighlightClass(data.createdAt)}>
                {t("created", {
                  date: format.dateTime(new Date(data.createdAt), {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                })}
              </span>
              {data.model && <span>{t("model", { model: data.model })}</span>}
              {data.mailedAt && (
                <span className="inline-flex items-center gap-1 text-[var(--green)]">
                  <Mail size={11} /> {t("delivered")}
                </span>
              )}
            </div>
          </div>
          <button onClick={remove} className="btn btn-danger">
            <Trash2 size={14} /> {t("delete")}
          </button>
        </div>

        {data.summary && (
          <p className="text-sm pt-3 border-t border-[var(--border)]">
            {data.summary}
          </p>
        )}

        {data.marketOverview && (
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("marketOverview")}
            </div>
            <p className="text-sm text-[var(--muted)]">{data.marketOverview}</p>
          </div>
        )}
      </div>

      {data.watchNext && data.watchNext.length > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">{t("watchNext")}</h2>
          <ul className="space-y-1 text-sm">
            {data.watchNext.map((w, i) => (
              <li key={i} className="flex gap-2">
                <Star size={13} className="text-yellow-400 flex-shrink-0 mt-1" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.upcomingEvents && data.upcomingEvents.length > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">{t("upcomingEvents")}</h2>
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            {data.upcomingEvents.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {sortedTicker.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">{t("relevantMoves")}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {sortedTicker.map((tt, i) => (
              <TickerCard key={i} t={tt} inPeriodLabel={t("inPeriod")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TickerCard({ t, inPeriodLabel }: { t: TickerItem; inPeriodLabel: string }) {
  const impactColor =
    t.impact === "positive"
      ? "text-[var(--green)]"
      : t.impact === "negative"
        ? "text-[var(--red)]"
        : "text-[var(--muted)]";
  const impactIcon =
    t.impact === "positive" ? (
      <TrendingUp size={14} />
    ) : t.impact === "negative" ? (
      <TrendingDown size={14} />
    ) : (
      <Minus size={14} />
    );

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/analysis/${encodeURIComponent(t.ticker)}`}
            className="font-semibold text-lg hover:text-[var(--accent)]"
          >
            {t.ticker}
          </Link>
          {t.name && (
            <div className="text-xs text-[var(--muted)]">{t.name}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs inline-flex items-center gap-1 ${impactColor}`}>
            {impactIcon}
            {t.impact}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {"★".repeat(t.relevance)}
            <span className="opacity-30">{"★".repeat(5 - t.relevance)}</span>
          </span>
        </div>
      </div>

      {t.priceChangePct != null && (
        <div
          className={`text-sm num ${
            t.priceChangePct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
          }`}
        >
          {t.priceChangePct >= 0 ? "+" : ""}
          {fmtPercent(t.priceChangePct)} {inPeriodLabel}
        </div>
      )}

      {t.summary && (
        <p className="text-sm text-[var(--muted)] leading-relaxed">{t.summary}</p>
      )}

      {t.keyFacts && t.keyFacts.length > 0 && (
        <ul className="text-xs space-y-1 pt-2 border-t border-[var(--border)]">
          {t.keyFacts.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--accent)]">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
