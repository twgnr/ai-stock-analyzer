"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { fmtNumber } from "@/lib/format";

interface AlertItem {
  _id: string;
  ticker: string;
  type?: "price" | "indicator";
  direction?: "above" | "below";
  threshold?: number;
  currency?: string;
  indicatorCondition?: string;
  triggeredAt: string;
  createdAt: string;
  notes?: string;
}

const INDICATOR_KEYS = [
  "rsi_below_30",
  "rsi_above_70",
  "macd_bullish_cross",
  "macd_bearish_cross",
  "sma_golden_cross",
  "sma_death_cross",
  "bb_breakout_upper",
  "bb_breakout_lower",
  "price_above_sma200",
  "price_below_sma200",
] as const;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export default function AlertHistoryPage() {
  const t = useTranslations("Alerts.historyPage");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  function indicatorLabel(key: string | undefined): string {
    if (!key) return "";
    if ((INDICATOR_KEYS as readonly string[]).includes(key)) {
      return t(`indicatorLabels.${key}` as never);
    }
    return key;
  }
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/history");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errors.load"));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!tickerFilter.trim()) return items;
    const q = tickerFilter.trim().toUpperCase();
    return items.filter((i) => i.ticker.includes(q));
  }, [items, tickerFilter]);

  const byMonth = useMemo(() => {
    const map = new Map<string, AlertItem[]>();
    for (const it of filtered) {
      const key = it.triggeredAt.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()].sort((a, b) => (a[0] > b[0] ? -1 : 1));
  }, [filtered]);

  const uniqueTickers = useMemo(
    () => new Set(items.map((i) => i.ticker)).size,
    [items]
  );
  const last30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return items.filter((i) => new Date(i.triggeredAt).getTime() >= cutoff).length;
  }, [items]);

  return (
    <div className="space-y-6">
      <Link
        href="/alerts"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <History size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("stats.totalTriggered")} value={String(items.length)} />
        <Stat label={t("stats.last30d")} value={String(last30d)} />
        <Stat label={t("stats.uniqueTickers")} value={String(uniqueTickers)} />
      </div>

      <div className="card p-3">
        <input
          type="text"
          placeholder={t("filterPlaceholder")}
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {items.length === 0 ? t("emptyAll") : t("emptyFiltered")}
        </div>
      ) : (
        <div className="space-y-4">
          {byMonth.map(([month, list]) => (
            <div key={month}>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("monthCount", {
                  month: new Date(month + "-01").toLocaleDateString(dateLocale, {
                    month: "long",
                    year: "numeric",
                  }),
                  count: list.length,
                })}
              </h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-3">{t("columns.ticker")}</th>
                      <th className="text-left font-medium px-3 py-3">{t("columns.condition")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("columns.triggered")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("columns.waited")}</th>
                      <th className="text-left font-medium px-3 py-3">{t("columns.note")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr
                        key={a._id}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-3 py-2 font-medium">
                          <Link
                            href={`/analysis/${encodeURIComponent(a.ticker)}`}
                            className="hover:text-[var(--accent)]"
                          >
                            {a.ticker}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {a.type === "indicator" ? (
                            <span className="text-xs text-[var(--accent)]">
                              {indicatorLabel(a.indicatorCondition) ||
                                a.indicatorCondition}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              {a.direction === "above" ? (
                                <ArrowUpCircle
                                  size={14}
                                  className="text-[var(--green)]"
                                />
                              ) : (
                                <ArrowDownCircle
                                  size={14}
                                  className="text-[var(--red)]"
                                />
                              )}
                              <span className="num">
                                {a.direction === "above" ? "≥" : "≤"}{" "}
                                {a.threshold != null
                                  ? fmtNumber(a.threshold, dateLocale, 2)
                                  : "?"}{" "}
                                {a.currency || ""}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[var(--muted)] num">
                          {new Date(a.triggeredAt).toLocaleString(dateLocale)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[var(--muted)] num">
                          {daysBetween(a.createdAt, a.triggeredAt)} {t("daysShort")}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">
                          {a.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-xl font-semibold num">{value}</div>
    </div>
  );
}
