"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Coins, Calendar, RefreshCw, AlertCircle, Trophy, CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtCurrency } from "@/lib/format";
import { useFxRates } from "@/lib/useFxRates";
import { PayoutFrequencyBadge } from "@/components/PayoutFrequencyBadge";

interface UpcomingDividend {
  ticker: string;
  name: string;
  exDate: string;
  payDate?: string;
  dividendRate?: number;
  currency: string;
  payoutsPerYear: number;
  payoutFrequency: string;
  inPortfolio: boolean;
  inWatchlist: boolean;
}

interface Transaction {
  _id: string;
  ticker: string;
  type: string;
  amount?: number;
  currency: string;
  date: string;
}

export default function DividendsPage() {
  const t = useTranslations("Dividends.overview");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const [upcoming, setUpcoming] = useState<UpcomingDividend[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [uRes, hRes] = await Promise.all([
        fetch("/api/dividends/upcoming"),
        fetch("/api/transactions?type=dividend"),
      ]);
      const u = await uRes.json();
      const h = await hRes.json();
      if (u.error) throw new Error(u.error);
      setUpcoming(u.items || []);
      setHistory(Array.isArray(h) ? h : []);
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

  const now = new Date();
  const currentYear = now.getFullYear();

  const allCurrencies = useMemo(
    () => [
      ...new Set([
        ...upcoming.map((u) => u.currency).filter(Boolean),
        ...history.map((h) => h.currency).filter(Boolean),
      ]),
    ],
    [upcoming, history]
  );
  const { toBase, base } = useFxRates(allCurrencies);

  const byYear = new Map<
    number,
    { count: number; totalBase: number; byCurrency: Map<string, number> }
  >();
  for (const h of history) {
    const y = new Date(h.date).getFullYear();
    const entry =
      byYear.get(y) || { count: 0, totalBase: 0, byCurrency: new Map<string, number>() };
    entry.count += 1;
    entry.byCurrency.set(
      h.currency,
      (entry.byCurrency.get(h.currency) || 0) + (h.amount || 0)
    );
    const eur = toBase(h.amount || 0, h.currency);
    if (eur != null) entry.totalBase += eur;
    byYear.set(y, entry);
  }
  const currentYearEntry = byYear.get(currentYear);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Coins size={22} className="text-yellow-400" />
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dividends/screener" className="btn">
            <Trophy size={14} /> {t("topList")}
          </Link>
          <Link href="/dividends-calendar" className="btn">
            <CalendarClock size={14} /> {t("calendar")}
          </Link>
          <button onClick={load} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {currentYearEntry && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">{t("statsCountLabel", { year: currentYear })}</div>
            <div className="text-xl font-semibold num">{currentYearEntry.count}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">
              {t("statsTotalLabel", { year: currentYear, base })}
            </div>
            <div className="text-xl font-semibold num text-yellow-400">
              {fmtCurrency(currentYearEntry.totalBase, base, dateLocale)}
            </div>
            {currentYearEntry.byCurrency.size > 1 && (
              <div className="text-xs text-[var(--muted)] mt-1">
                {[...currentYearEntry.byCurrency]
                  .map(([cur, total]) => `${fmtCurrency(total, cur, dateLocale)}`)
                  .join(" + ")}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} className="text-[var(--muted)]" />
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
            {t("upcomingTitle")}
          </h2>
        </div>
        {loading ? (
          <div className="card p-6 text-center text-[var(--muted)]">
            <div className="spinner mb-2" /> {t("loading")}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="card p-6 text-center text-[var(--muted)]">
            {t("upcomingEmpty")}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("thTicker")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("thExDate")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("thPayDate")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("thDividend")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("thStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((d) => {
                  const exDate = new Date(d.exDate);
                  const days = Math.ceil((exDate.getTime() - now.getTime()) / 86400000);
                  return (
                    <tr
                      key={d.ticker}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-3">
                        <Link
                          href={`/analysis/${encodeURIComponent(d.ticker)}`}
                          className="block"
                        >
                          <div className="font-semibold">{d.ticker}</div>
                          <div className="text-xs text-[var(--muted)] truncate max-w-[200px]">
                            {d.name}
                          </div>
                        </Link>
                        <div className="mt-1">
                          <PayoutFrequencyBadge
                            frequency={d.payoutFrequency}
                            payoutsPerYear={d.payoutsPerYear}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div>{exDate.toLocaleDateString(dateLocale)}</div>
                        <div className="text-[var(--muted)]">
                          {days > 0
                            ? t("inDays", { days })
                            : t("daysAgo", { days: -days })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {d.payDate
                          ? new Date(d.payDate).toLocaleDateString(dateLocale)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right num text-xs">
                        {d.dividendRate
                          ? (() => {
                              const eur = toBase(d.dividendRate, d.currency);
                              if (eur != null && d.currency.toUpperCase() !== base) {
                                return (
                                  <>
                                    <div>{fmtCurrency(eur, base, dateLocale)}</div>
                                    <div className="text-[10px] text-[var(--muted)]">
                                      {fmtCurrency(d.dividendRate, d.currency, dateLocale)}
                                    </div>
                                  </>
                                );
                              }
                              return fmtCurrency(d.dividendRate, d.currency, dateLocale);
                            })()
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {d.inPortfolio && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-[var(--accent)]">
                              {t("tagPortfolio")}
                            </span>
                          )}
                          {d.inWatchlist && (
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
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          {t("receivedTitle")}
        </h2>
        {history.length === 0 ? (
          <div className="card p-6 text-center text-[var(--muted)] text-sm">
            {t("receivedEmptyPrefix")}{" "}
            <Link href="/transactions" className="underline">
              {t("receivedEmptyLink")}
            </Link>{" "}
            {t("receivedEmptySuffix")}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("thDate")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("thTicker")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("thAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const eur = toBase(h.amount || 0, h.currency);
                  return (
                    <tr
                      key={h._id}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-3 text-xs">
                        {new Date(h.date).toLocaleDateString(dateLocale)}
                      </td>
                      <td className="px-3 py-3 font-semibold">{h.ticker}</td>
                      <td className="px-3 py-3 text-right num text-yellow-400">
                        {eur != null && h.currency.toUpperCase() !== base ? (
                          <>
                            <div>{fmtCurrency(eur, base, dateLocale)}</div>
                            <div className="text-[10px] text-[var(--muted)]">
                              {fmtCurrency(h.amount || 0, h.currency, dateLocale)}
                            </div>
                          </>
                        ) : (
                          fmtCurrency(h.amount || 0, h.currency, dateLocale)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
