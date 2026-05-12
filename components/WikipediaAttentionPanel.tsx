"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { Sparkline } from "@/components/Sparkline";

interface Series {
  article: string;
  daily: Array<{ date: string; views: number }>;
  recentAvg7d: number;
  baselineAvg30d: number;
  spikeRatio: number;
  recentMax: number;
}

interface ApiResponse {
  ticker: string;
  name: string;
  article: string;
  series: Series | null;
  configured: boolean;
  error?: string;
}

type SpikeKey = "strong" | "elevated" | "declining" | "normal";

function spikeInfo(ratio: number): { key: SpikeKey; className: string; Icon: typeof TrendingUp } {
  if (ratio >= 2)
    return { key: "strong", className: "text-[var(--green)]", Icon: TrendingUp };
  if (ratio >= 1.4)
    return { key: "elevated", className: "text-[var(--green)]", Icon: TrendingUp };
  if (ratio <= 0.7)
    return { key: "declining", className: "text-[var(--red)]", Icon: TrendingDown };
  return { key: "normal", className: "text-[var(--muted)]", Icon: Minus };
}

export function WikipediaAttentionPanel({ ticker }: { ticker: string }) {
  const t = useTranslations("AnalysisPanels.wikipedia");
  const tCommon = useTranslations("AnalysisPanels.common");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/insights/wikipedia?ticker=${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tCommon("error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, tCommon]);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>

      {loading && (
        <div className="text-xs text-[var(--muted)] flex items-center gap-2">
          <span className="spinner" /> {t("loading")}
        </div>
      )}

      {error && (
        <div className="text-sm text-[var(--red)] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && !data.series && (
        <div className="text-xs text-[var(--muted)]">
          {t("empty", { name: data.name })}
        </div>
      )}

      {!loading && !error && data?.series && (
        <WikipediaContent data={data} series={data.series} />
      )}
    </div>
  );
}

function WikipediaContent({ data, series }: { data: ApiResponse; series: Series }) {
  const t = useTranslations("AnalysisPanels.wikipedia");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const info = spikeInfo(series.spikeRatio);
  const last7 = series.daily.slice(-7);
  const all = series.daily;
  const totalLast7 = last7.reduce((s, d) => s + d.views, 0);
  const articleName = data.article.replace(/_/g, " ");
  return (
    <>
      <p className="text-xs text-[var(--muted)]">
        {t.rich("intro", {
          article: articleName,
          link: (chunks) => (
            <a
              href={`https://en.wikipedia.org/wiki/${encodeURIComponent(data.article)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>

      <div className="grid grid-cols-3 gap-3 pt-1">
        <Stat
          label={t("avg7")}
          value={Math.round(series.recentAvg7d).toLocaleString(numLocale)}
        />
        <Stat
          label={t("baseline30")}
          value={Math.round(series.baselineAvg30d).toLocaleString(numLocale)}
        />
        <Stat
          label={t("spike")}
          value={`${series.spikeRatio.toFixed(2)}x`}
          valueClass={info.className}
          subValue={
            <span className={`inline-flex items-center gap-1 ${info.className}`}>
              <info.Icon size={11} aria-hidden="true" />{" "}
              {t(`spikes.${info.key}` as Parameters<typeof t>[0])}
            </span>
          }
        />
      </div>

      <div className="pt-2 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
            {t("history", { count: all.length })}
          </div>
          <div className="text-xs text-[var(--muted)] num">
            {t("totalViews", { count: totalLast7.toLocaleString(numLocale) })}
          </div>
        </div>
        <Sparkline data={all.map((d) => d.views)} width={520} height={56} />
        <div className="flex justify-between text-[10px] text-[var(--muted)] num mt-1">
          <span>{all[0]?.date}</span>
          <span>{all[all.length - 1]?.date}</span>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  subValue,
  valueClass,
}: {
  label: string;
  value: string;
  subValue?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="border border-[var(--border)] rounded-md p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
        {label}
      </div>
      <div className={`num font-semibold text-base ${valueClass ?? ""}`}>{value}</div>
      {subValue && <div className="text-[10px] mt-0.5">{subValue}</div>}
    </div>
  );
}
