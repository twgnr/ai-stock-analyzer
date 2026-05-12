"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Flame,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Search,
  RefreshCw,
} from "lucide-react";

interface AttentionRow {
  ticker: string;
  name: string;
  source: "portfolio" | "watchlist" | "both";
  wikipedia?: { spikeRatio: number; recentAvg7d: number; baselineAvg30d: number };
  googleTrends?: {
    spikeRatio: number;
    recentAvg7d: number;
    baselineAvg30d: number;
    rising: Array<{ query: string; formatted: string }>;
  };
  combinedSpike: number;
}

interface ApiResponse {
  rows: AttentionRow[];
  totalTickers: number;
  asOf?: number;
  error?: string;
}

function spikeIcon(ratio: number) {
  if (ratio >= 1.4) return <TrendingUp size={11} className="text-[var(--green)]" />;
  if (ratio <= 0.7) return <TrendingDown size={11} className="text-[var(--red)]" />;
  return <Minus size={11} className="text-[var(--muted)]" />;
}

function spikeClass(ratio: number) {
  if (ratio >= 2) return "text-[var(--green)] font-semibold";
  if (ratio >= 1.4) return "text-[var(--green)]";
  if (ratio <= 0.7) return "text-[var(--red)]";
  return "text-[var(--muted)]";
}

export function MarketAttentionWidget() {
  const t = useTranslations("Widgets.attention");
  const tHead = useTranslations("Widgets.attention.thead");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market/attention", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">{t("title")}</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn text-xs"
          title={t("reloadTitle")}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">{t("intro")}</p>

      {loading && !data && (
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

      {data && data.rows.length === 0 && !loading && (
        <div className="text-xs text-[var(--muted)]">{t("empty")}</div>
      )}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium py-2 pr-2">{tHead("ticker")}</th>
                <th className="text-right font-medium py-2 px-2 hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen size={11} aria-hidden="true" /> {tHead("wiki")}
                  </span>
                </th>
                <th className="text-right font-medium py-2 px-2">
                  <span className="inline-flex items-center gap-1">
                    <Search size={11} aria-hidden="true" /> {tHead("google")}
                  </span>
                </th>
                <th className="text-left font-medium py-2 pl-2 hidden md:table-cell">
                  {tHead("rising")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const top = r.combinedSpike >= 1.4;
                return (
                  <tr
                    key={r.ticker}
                    className={`border-b border-[var(--border)] last:border-b-0 ${
                      top ? "bg-[var(--accent)]/5" : ""
                    }`}
                  >
                    <td className="py-2 pr-2">
                      <Link
                        href={`/analysis/${encodeURIComponent(r.ticker)}`}
                        className="block"
                      >
                        <div className="font-semibold flex items-center gap-1.5">
                          {r.ticker}
                          {r.source === "portfolio" || r.source === "both" ? (
                            <span
                              title={t("inPortfolio")}
                              className="text-[10px] px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]"
                            >
                              P
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--muted)] truncate max-w-[180px]">
                          {r.name}
                        </div>
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-right num hidden sm:table-cell">
                      {r.wikipedia ? (
                        <div
                          className={`inline-flex items-center gap-1 ${spikeClass(
                            r.wikipedia.spikeRatio
                          )}`}
                        >
                          {spikeIcon(r.wikipedia.spikeRatio)}
                          {r.wikipedia.spikeRatio.toFixed(2)}x
                        </div>
                      ) : (
                        <span className="text-[var(--muted)] opacity-50">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right num">
                      {r.googleTrends ? (
                        <div
                          className={`inline-flex items-center gap-1 ${spikeClass(
                            r.googleTrends.spikeRatio
                          )}`}
                        >
                          {spikeIcon(r.googleTrends.spikeRatio)}
                          {r.googleTrends.spikeRatio.toFixed(2)}x
                        </div>
                      ) : (
                        <span className="text-[var(--muted)] opacity-50">—</span>
                      )}
                    </td>
                    <td className="py-2 pl-2 hidden md:table-cell">
                      {r.googleTrends?.rising?.length ? (
                        <div className="text-xs text-[var(--muted)] flex flex-wrap gap-1">
                          {r.googleTrends.rising.slice(0, 2).map((q, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[10px]"
                              title={q.formatted}
                            >
                              {q.query}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--muted)] opacity-50 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <p className="text-[10px] text-[var(--muted)]">{t("explanation")}</p>}
    </div>
  );
}
