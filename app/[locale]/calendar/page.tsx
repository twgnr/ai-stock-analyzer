"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, RefreshCw, AlertCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtNumber } from "@/lib/format";
import { useFxRates } from "@/lib/useFxRates";

interface UpcomingEarnings {
  ticker: string;
  name: string;
  earningsDate: string;
  estimateEPS?: number;
  currency: string;
  inPortfolio: boolean;
  inWatchlist: boolean;
}

export default function CalendarPage() {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const numberLocale = dateLocale;

  const [items, setItems] = useState<UpcomingEarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "portfolio" | "watchlist">("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/earnings-calendar");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((i) => {
    if (filter === "portfolio") return i.inPortfolio;
    if (filter === "watchlist") return i.inWatchlist;
    return true;
  });

  const allCurrencies = useMemo(
    () => [...new Set(items.map((i) => i.currency).filter(Boolean))],
    [items]
  );
  const { toBase, base } = useFxRates(allCurrencies);

  const byMonth = new Map<string, UpcomingEarnings[]>();
  const now = new Date();
  for (const i of filtered) {
    const d = new Date(i.earningsDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) || [];
    list.push(i);
    byMonth.set(key, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarDays size={22} className="text-[var(--accent)]" />
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      <div className="flex gap-2">
        {(["all", "portfolio", "watchlist"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              filter === f
                ? "border-[var(--accent)] bg-blue-500/10"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {t(`filter.${f}` as "filter.all" | "filter.portfolio" | "filter.watchlist")}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-6 text-center text-[var(--muted)]">
          <div className="spinner mb-2" /> {t("loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-center text-[var(--muted)]">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {[...byMonth.entries()].map(([month, list]) => {
            const [y, m] = month.split("-");
            const monthLabel = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString(
              dateLocale,
              { month: "long", year: "numeric" }
            );
            return (
              <div key={month}>
                <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  {monthLabel}
                </h3>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left font-medium px-3 py-3">{t("thDate")}</th>
                        <th className="text-left font-medium px-3 py-3">{t("thTicker")}</th>
                        <th className="text-right font-medium px-3 py-3">{t("thEpsEstimate")}</th>
                        <th className="text-left font-medium px-3 py-3">{t("thStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e) => {
                        const d = new Date(e.earningsDate);
                        const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
                        return (
                          <tr
                            key={e.ticker}
                            className="border-b border-[var(--border)] last:border-b-0"
                          >
                            <td className="px-3 py-3 text-xs">
                              <div>{d.toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" })}</div>
                              <div className="text-[var(--muted)]">
                                {days > 0
                                  ? t("inDays", { days })
                                  : days === 0
                                  ? t("today")
                                  : t("daysAgo", { days: -days })}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Link
                                href={`/analysis/${encodeURIComponent(e.ticker)}`}
                                className="block"
                              >
                                <div className="font-semibold">{e.ticker}</div>
                                <div className="text-xs text-[var(--muted)] truncate max-w-[200px]">
                                  {e.name}
                                </div>
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-right num text-xs">
                              {e.estimateEPS != null
                                ? (() => {
                                    const eur = toBase(e.estimateEPS, e.currency);
                                    if (
                                      eur != null &&
                                      e.currency.toUpperCase() !== base
                                    ) {
                                      return (
                                        <>
                                          <div>
                                            {fmtNumber(eur, numberLocale, 2)} {base}
                                          </div>
                                          <div className="text-[10px] text-[var(--muted)]">
                                            {fmtNumber(e.estimateEPS, numberLocale, 2)}{" "}
                                            {e.currency}
                                          </div>
                                        </>
                                      );
                                    }
                                    return `${fmtNumber(e.estimateEPS, numberLocale, 2)} ${e.currency}`;
                                  })()
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {e.inPortfolio && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-[var(--accent)]">
                                    {t("tagPortfolio")}
                                  </span>
                                )}
                                {e.inWatchlist && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]">
                                    {t("tagWatchlist")}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
