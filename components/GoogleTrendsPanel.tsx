"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Flame,
} from "lucide-react";
import { Sparkline } from "@/components/Sparkline";

interface RisingQuery {
  query: string;
  value: number;
  formatted: string;
}

interface Snapshot {
  keyword: string;
  geo: string;
  timeline: Array<{ date: string; value: number }>;
  recentAvg7d: number;
  baselineAvg30d: number;
  spikeRatio: number;
  rising: RisingQuery[];
}

interface ApiResponse {
  ticker: string;
  name: string;
  keyword: string;
  snapshot: Snapshot | null;
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

export function GoogleTrendsPanel({ ticker }: { ticker: string }) {
  const t = useTranslations("AnalysisPanels.googleTrends");
  const tCommon = useTranslations("AnalysisPanels.common");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/insights/trends?ticker=${encodeURIComponent(ticker)}`)
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
        <Search size={16} className="text-[var(--accent)]" aria-hidden="true" />
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

      {!loading && !error && data && !data.snapshot && (
        <div className="text-xs text-[var(--muted)]">
          {t("empty", { keyword: data.keyword })}
        </div>
      )}

      {!loading && !error && data?.snapshot && (
        <TrendsContent snapshot={data.snapshot} keyword={data.keyword} />
      )}
    </div>
  );
}

function TrendsContent({ snapshot, keyword }: { snapshot: Snapshot; keyword: string }) {
  const t = useTranslations("AnalysisPanels.googleTrends");
  const info = spikeInfo(snapshot.spikeRatio);
  const all = snapshot.timeline;
  return (
    <>
      <p className="text-xs text-[var(--muted)]">
        {t("intro", { keyword, geo: snapshot.geo })}
      </p>

      <div className="grid grid-cols-3 gap-3 pt-1">
        <Stat label={t("avg7")} value={`${snapshot.recentAvg7d.toFixed(0)}/100`} />
        <Stat
          label={t("baseline30")}
          value={`${snapshot.baselineAvg30d.toFixed(0)}/100`}
        />
        <Stat
          label={t("spike")}
          value={`${snapshot.spikeRatio.toFixed(2)}x`}
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
        <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
          {t("history", { count: all.length })}
        </div>
        <Sparkline data={all.map((d) => d.value)} width={520} height={56} />
        <div className="flex justify-between text-[10px] text-[var(--muted)] num mt-1">
          <span>{all[0]?.date}</span>
          <span>{all[all.length - 1]?.date}</span>
        </div>
      </div>

      {snapshot.rising.length > 0 && (
        <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Flame size={11} className="text-[var(--accent)]" aria-hidden="true" />{" "}
            {t("rising")}
          </div>
          <ul className="text-sm space-y-1">
            {snapshot.rising.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(r.query)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate"
                >
                  {r.query}
                </a>
                <span className="text-xs text-[var(--accent)] font-medium num flex-shrink-0">
                  {r.formatted}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
