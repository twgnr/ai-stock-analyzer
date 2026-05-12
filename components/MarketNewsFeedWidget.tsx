"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Newspaper, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";

interface NewsRow {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  ticker: string;
  ageSec: number;
}

interface ApiResponse {
  rows: NewsRow[];
  totalTickers: number;
  asOf?: number;
  error?: string;
}

type AgeKey = "ageSeconds" | "ageMinutes" | "ageHours" | "ageDays";

function fmtAge(ageSec: number): { key: AgeKey; n: number } {
  if (ageSec < 60) return { key: "ageSeconds", n: ageSec };
  const min = Math.round(ageSec / 60);
  if (min < 60) return { key: "ageMinutes", n: min };
  const h = Math.round(min / 60);
  if (h < 24) return { key: "ageHours", n: h };
  const d = Math.round(h / 24);
  return { key: "ageDays", n: d };
}

export function MarketNewsFeedWidget() {
  const t = useTranslations("Widgets.newsFeed");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market/news-feed", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
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
          <Newspaper size={16} className="text-[var(--accent)]" aria-hidden="true" />
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
        <ul className="divide-y divide-[var(--border)] -mx-1">
          {data.rows.map((n, i) => {
            const age = fmtAge(n.ageSec);
            const prefix = t("agePrefix");
            const ageLabel = t(age.key, { n: age.n });
            return (
              <li key={i} className="py-2 px-1 hover:bg-[var(--surface-2)] rounded">
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/analysis/${encodeURIComponent(n.ticker)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline mt-0.5 num flex-shrink-0 w-12 text-right"
                    >
                      {n.ticker}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm group-hover:underline flex items-start gap-1">
                        <span className="flex-1">{n.title}</span>
                        <ExternalLink
                          size={11}
                          className="text-[var(--muted)] flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 num">
                        {n.publisher} · {prefix ? `${prefix} ${ageLabel}` : ageLabel}
                      </div>
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
