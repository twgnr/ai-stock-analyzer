"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RefreshCw, Trash2, Plus, AlertCircle, Users } from "lucide-react";
import { TickerSearch } from "@/components/TickerSearch";
import { ConvictionBadge, fetchConvictionScores } from "@/components/ConvictionBadge";
import { Sparkline } from "@/components/Sparkline";
import { TickerLink } from "@/components/TickerLink";
import { SkeletonTable } from "@/components/Skeleton";
import { fmtCurrency, fmtPercent, fmtNumber, changeClass } from "@/lib/format";
import { isWithinExtendedTradingWindow } from "@/lib/tradingHours";

const AUTO_REFRESH_MS = 60 * 1000;

interface WatchlistItem {
  _id: string;
  ticker: string;
  name?: string;
  notes?: string;
  createdAt: string;
}

interface Quote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

interface EnrichedItem extends WatchlistItem {
  quote?: Quote;
  priceBase?: number;
  distanceFromHigh?: number;
  distanceFromLow?: number;
  fxRate?: number;
  baseCurrency: string;
}

const BASE_CURRENCY = "EUR";

export default function WatchlistPage() {
  const t = useTranslations("Watchlist");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      if (!silent) setError(null);
      const rRes = await fetch("/api/watchlist");
      if (rRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const raw = await rRes.json();
      if (!Array.isArray(raw)) {
        if (!silent) setError(raw.error || t("errors.apiNoArray"));
        return;
      }
      if (raw.length === 0) {
        setItems([]);
        return;
      }
      const tickers = raw.map((p) => p.ticker).join(",");
      const qRes = await fetch(`/api/stocks/quote?tickers=${encodeURIComponent(tickers)}`);
      const quotes: Quote[] = await qRes.json();
      const quoteMap = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));

      const currencies = [...new Set(quotes.map((q) => q.currency).filter(Boolean))];
      let fxRates: Record<string, number> = {};
      if (currencies.length > 0) {
        const fxRes = await fetch(
          `/api/fx?currencies=${encodeURIComponent(currencies.join(","))}`
        );
        const fxData = (await fxRes.json()) as { base: string; rates: Record<string, number> };
        fxRates = fxData.rates || {};
      }
      const rateFor = (c: string) =>
        c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

      setItems(
        raw.map((w) => {
          const q = quoteMap.get(w.ticker.toUpperCase());
          const fx = q ? rateFor(q.currency) : 0;
          const distHigh =
            q?.fiftyTwoWeekHigh && q.price
              ? ((q.fiftyTwoWeekHigh - q.price) / q.fiftyTwoWeekHigh) * 100
              : undefined;
          const distLow =
            q?.fiftyTwoWeekLow && q.price
              ? ((q.price - q.fiftyTwoWeekLow) / q.fiftyTwoWeekLow) * 100
              : undefined;
          return {
            ...w,
            quote: q,
            priceBase: q && fx > 0 ? q.price * fx : undefined,
            fxRate: fx,
            distanceFromHigh: distHigh,
            distanceFromLow: distLow,
            baseCurrency: BASE_CURRENCY,
          };
        })
      );

      fetchConvictionScores(raw.map((r) => r.ticker)).catch(() => {});
      // Sparklines im Hintergrund nachladen
      fetch("/api/stocks/sparklines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: raw.map((r) => r.ticker) }),
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((map: Record<string, number[]>) => {
          if (map && typeof map === "object") setSparklines(map);
        })
        .catch(() => {});
      return;
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : t("errors.load"));
      return;
    } finally {
      if (!silent) setRefreshing(false);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    }, AUTO_REFRESH_MS);
    // Sofort-Refresh, wenn der Tab wieder sichtbar wird — sonst sieht der User
    // nach Stunden den alten Stand bis zum nächsten Intervall-Tick.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function addTicker(ticker: string, name: string) {
    setAdding(true);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name }),
      });
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/watchlist/community" className="btn">
            <Users size={14} /> {t("community")}
          </Link>
          <button onClick={() => load()} disabled={refreshing} className="btn">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
        </div>
      </div>

      <div className="card p-4">
        <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
          {t("addStock")}
        </label>
        <TickerSearch
          onSelect={(r) => addTicker(r.ticker, r.name)}
          placeholder={t("tickerOrName")}
        />
        {adding && <div className="mt-2 text-xs text-[var(--muted)] flex items-center gap-2"><div className="spinner" /> {t("adding")}</div>}
      </div>

      {error && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <Plus size={24} className="mx-auto mb-2 opacity-50" />
          {t("empty")}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th data-help="col:portfolio:ticker" className="text-left font-medium px-4 py-3">
                  {t("columns.ticker")}
                </th>
                <th data-help="col:watchlist:price" className="text-right font-medium px-4 py-3">
                  {t("columns.price")}
                </th>
                <th data-help="col:portfolio:today" className="text-right font-medium px-4 py-3">
                  {t("columns.today")}
                </th>
                <th
                  data-help="col:portfolio:trend"
                  className="text-center font-medium px-2 py-3 w-[110px]"
                >
                  {t("columns.trend3M")}
                </th>
                <th data-help="col:watchlist:high" className="text-right font-medium px-4 py-3">
                  {t("columns.distHigh")}
                </th>
                <th data-help="col:watchlist:low" className="text-right font-medium px-4 py-3">
                  {t("columns.distLow")}
                </th>
                <th
                  data-help="col:watchlist:conviction"
                  className="text-center font-medium px-4 py-3"
                >
                  {t("columns.conviction")}
                </th>
                <th className="text-left font-medium px-4 py-3">{t("columns.note")}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <TickerLink ticker={item.ticker}>
                      <span className="block">
                        <span className="block font-semibold">{item.ticker}</span>
                        <span className="block text-xs text-[var(--muted)] truncate max-w-[200px]">
                          {item.quote?.name || item.name}
                        </span>
                      </span>
                    </TickerLink>
                  </td>
                  <td className="px-4 py-3 text-right num">
                    {item.quote ? (
                      <>
                        <div>
                          {item.priceBase != null
                            ? fmtCurrency(item.priceBase, item.baseCurrency)
                            : fmtCurrency(item.quote.price, item.quote.currency)}
                        </div>
                        {item.quote.currency.toUpperCase() !== item.baseCurrency &&
                          item.priceBase != null && (
                            <div className="text-xs text-[var(--muted)] opacity-60">
                              {fmtCurrency(item.quote.price, item.quote.currency)}
                            </div>
                          )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right num ${item.quote ? changeClass(item.quote.changePercent) : ""}`}>
                    {item.quote ? fmtPercent(item.quote.changePercent) : "—"}
                  </td>
                  <td className="px-2 py-3">
                    {sparklines[item.ticker.toUpperCase()]?.length ? (
                      <div className="flex justify-center">
                        <Sparkline
                          data={sparklines[item.ticker.toUpperCase()]}
                          width={90}
                          height={26}
                        />
                      </div>
                    ) : (
                      <div className="text-center text-[var(--muted)] opacity-40 text-xs">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right num text-[var(--muted)]">
                    {item.distanceFromHigh != null
                      ? `-${fmtNumber(item.distanceFromHigh, numberLocale, 1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right num text-[var(--muted)]">
                    {item.distanceFromLow != null
                      ? `+${fmtNumber(item.distanceFromLow, numberLocale, 1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ConvictionBadge ticker={item.ticker} />
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs max-w-[200px] truncate">
                    {item.notes || "—"}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => remove(item._id)}
                      className="p-2 text-[var(--muted)] hover:text-[var(--red)] transition-colors"
                      title={t("remove")}
                      aria-label={t("removeAria", { ticker: item.ticker })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
