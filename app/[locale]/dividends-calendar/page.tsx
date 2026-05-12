"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CalendarClock,
  RefreshCw,
  AlertCircle,
  Briefcase,
  Eye,
  Clock,
  Trophy,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { useFxRates } from "@/lib/useFxRates";
import { PayoutFrequencyBadge } from "@/components/PayoutFrequencyBadge";

interface Item {
  ticker: string;
  name?: string;
  currency: string;
  exDividendDate?: string;
  daysUntil?: number;
  dividendRate?: number;
  dividendYield?: number;
  payoutRatio?: number;
  payoutsPerYear: number;
  payoutFrequency: string;
  inPortfolio: boolean;
  inWatchlist: boolean;
  latestAmount?: number;
  latestDate?: string;
}

export default function DividendsCalendarPage() {
  const t = useTranslations("Dividends.calendar");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "portfolio" | "watchlist">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dividends-calendar");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "portfolio") return items.filter((i) => i.inPortfolio);
    if (filter === "watchlist") return items.filter((i) => i.inWatchlist);
    return items;
  }, [items, filter]);

  const upcoming = filtered.filter((i) => i.daysUntil != null && i.daysUntil >= 0);
  const past = filtered.filter((i) => i.daysUntil == null || i.daysUntil < 0);

  const allCurrencies = useMemo(
    () => [...new Set(items.map((i) => i.currency).filter(Boolean))],
    [items]
  );
  const { toBase, base } = useFxRates(allCurrencies);

  const { totalBase, byCurrency } = useMemo(() => {
    const byCur = new Map<string, number>();
    let total = 0;
    for (const i of filtered) {
      if (!i.inPortfolio || i.dividendRate == null) continue;
      byCur.set(i.currency, (byCur.get(i.currency) || 0) + i.dividendRate);
      const eur = toBase(i.dividendRate, i.currency);
      if (eur != null) total += eur;
    }
    return { totalBase: total, byCurrency: byCur };
  }, [filtered, toBase]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dividends/screener" className="btn">
            <Trophy size={14} /> {t("topList")}
          </Link>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "portfolio" | "watchlist")
            }
            className="input w-auto"
          >
            <option value="all">{t("filterAll", { count: items.length })}</option>
            <option value="portfolio">
              {t("filterPortfolio", { count: items.filter((i) => i.inPortfolio).length })}
            </option>
            <option value="watchlist">
              {t("filterWatchlist", { count: items.filter((i) => i.inWatchlist).length })}
            </option>
          </select>
          <button onClick={load} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {byCurrency.size > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">
            {t("annualRateTitle")}
          </h2>
          <div className="text-xs text-[var(--muted)]">
            {t.rich("annualRateDescription", {
              base,
              bold: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
          <div className="flex flex-wrap items-baseline gap-4 text-sm">
            <div>
              <span className="text-[var(--muted)]">{t("sumLabel", { base })}</span>{" "}
              <span className="num font-semibold text-lg text-yellow-400">
                {fmtCurrency(totalBase, base, dateLocale)}
              </span>
            </div>
            {byCurrency.size > 1 && (
              <div className="text-xs text-[var(--muted)]">
                ({[...byCurrency.entries()]
                  .map(([cur, total]) => `${fmtNumber(total, dateLocale, 2)} ${cur}`)
                  .join(" + ")})
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {t("empty")}
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-2">
                <Clock size={14} /> {t("upcomingTitle", { count: upcoming.length })}
              </h2>
              <DividendTable items={upcoming} future toBase={toBase} base={base} />
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("pastTitle", { count: past.length })}
              </h2>
              <DividendTable items={past} future={false} toBase={toBase} base={base} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DividendTable({
  items,
  future,
  toBase,
  base,
}: {
  items: Item[];
  future: boolean;
  toBase: (amount: number, currency: string) => number | null;
  base: string;
}) {
  const t = useTranslations("Dividends.calendar");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left font-medium px-3 py-3">{t("thTicker")}</th>
            <th className="text-left font-medium px-3 py-3">{t("thExDividend")}</th>
            {future && (
              <th className="text-right font-medium px-3 py-3">{t("thInDays")}</th>
            )}
            <th className="text-left font-medium px-3 py-3">{t("thFrequency")}</th>
            <th className="text-right font-medium px-3 py-3">{t("thRatePerYear")}</th>
            <th className="text-right font-medium px-3 py-3">{t("thYield")}</th>
            <th className="text-right font-medium px-3 py-3">{t("thPayout")}</th>
            <th className="text-right font-medium px-3 py-3">{t("thLastPayment")}</th>
            <th className="text-left font-medium px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={i.ticker}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/analysis/${encodeURIComponent(i.ticker)}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {i.ticker}
                </Link>
                {i.name && (
                  <div className="text-xs text-[var(--muted)]">{i.name}</div>
                )}
              </td>
              <td className="px-3 py-2 text-xs num">
                {i.exDividendDate
                  ? new Date(i.exDividendDate).toLocaleDateString(dateLocale)
                  : "—"}
              </td>
              {future && (
                <td
                  className={`px-3 py-2 text-right num ${
                    i.daysUntil != null && i.daysUntil <= 7
                      ? "text-yellow-400 font-semibold"
                      : ""
                  }`}
                >
                  {i.daysUntil != null ? `${i.daysUntil}${t("daysSuffix")}` : "—"}
                </td>
              )}
              <td className="px-3 py-2">
                <PayoutFrequencyBadge
                  frequency={i.payoutFrequency}
                  payoutsPerYear={i.payoutsPerYear}
                />
              </td>
              <td className="px-3 py-2 text-right num">
                {i.dividendRate != null ? (
                  (() => {
                    const eur = toBase(i.dividendRate, i.currency);
                    if (eur != null && i.currency.toUpperCase() !== base) {
                      return (
                        <>
                          <div>{fmtCurrency(eur, base, dateLocale)}</div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {fmtNumber(i.dividendRate, dateLocale, 2)} {i.currency}
                          </div>
                        </>
                      );
                    }
                    return `${fmtNumber(i.dividendRate, dateLocale, 2)} ${i.currency}`;
                  })()
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right num">
                {i.dividendYield != null
                  ? fmtPercent(i.dividendYield * 100, dateLocale)
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right num text-xs text-[var(--muted)]">
                {i.payoutRatio != null ? fmtPercent(i.payoutRatio * 100, dateLocale) : "—"}
              </td>
              <td className="px-3 py-2 text-right num text-xs">
                {i.latestAmount != null && i.latestDate ? (
                  (() => {
                    const eur = toBase(i.latestAmount, i.currency);
                    const dateStr = new Date(i.latestDate).toLocaleDateString(dateLocale);
                    if (eur != null && i.currency.toUpperCase() !== base) {
                      return (
                        <>
                          <div>
                            {fmtCurrency(eur, base, dateLocale)} ({dateStr})
                          </div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {fmtCurrency(i.latestAmount, i.currency, dateLocale)}
                          </div>
                        </>
                      );
                    }
                    return `${fmtCurrency(i.latestAmount, i.currency, dateLocale)} (${dateStr})`;
                  })()
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {i.inPortfolio && (
                    <Briefcase
                      size={12}
                      className="text-[var(--accent)]"
                      aria-label={t("inPortfolio")}
                    />
                  )}
                  {i.inWatchlist && (
                    <Eye
                      size={12}
                      className="text-[var(--muted)]"
                      aria-label={t("onWatchlist")}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
