"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { FileText, Download, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { fmtCurrency, fmtNumber } from "@/lib/format";

interface Gain {
  _id: string;
  ticker: string;
  shares: number;
  avgBuyPrice: number;
  sellPrice: number;
  currency: string;
  fxRate: number;
  gainBase: number;
  baseCurrency: string;
  saleDate: string;
}

interface YearTotal {
  year: number;
  total: number;
  count: number;
}

const SPARER_PAUSCHBETRAG = 1000; // EUR, Single. Paar: 2000.
const ABGELTUNG_RATE = 0.25;
const SOLI_RATE = 0.055;

export default function TaxReportPage() {
  const t = useTranslations("TaxReport");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [year, setYear] = useState<number | "all">(new Date().getFullYear());
  const [gains, setGains] = useState<Gain[]>([]);
  const [yearlyTotals, setYearlyTotals] = useState<YearTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = year !== "all" ? `?year=${year}` : "";
      const res = await fetch(`/api/realized-gains${qs}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("loadError"));
      setGains(Array.isArray(data.gains) ? data.gains : []);
      setYearlyTotals(Array.isArray(data.yearlyTotals) ? data.yearlyTotals : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [year, t]);

  useEffect(() => {
    load();
  }, [load]);

  const baseCurrency = gains[0]?.baseCurrency || "EUR";

  const summary = useMemo(() => {
    const gross = gains.reduce((s, g) => s + g.gainBase, 0);
    const profits = gains.filter((g) => g.gainBase >= 0).reduce((s, g) => s + g.gainBase, 0);
    const losses = gains.filter((g) => g.gainBase < 0).reduce((s, g) => s + g.gainBase, 0);
    const afterPauschbetrag = Math.max(0, gross - SPARER_PAUSCHBETRAG);
    const estAbgeltung = afterPauschbetrag * ABGELTUNG_RATE;
    const estSoli = estAbgeltung * SOLI_RATE;
    const estTotal = estAbgeltung + estSoli;
    return {
      gross,
      profits,
      losses,
      afterPauschbetrag,
      estAbgeltung,
      estSoli,
      estTotal,
      tradeCount: gains.length,
      winCount: gains.filter((g) => g.gainBase >= 0).length,
      lossCount: gains.filter((g) => g.gainBase < 0).length,
    };
  }, [gains]);

  const byTicker = useMemo(() => {
    const map = new Map<string, { ticker: string; gainBase: number; count: number }>();
    for (const g of gains) {
      const hit = map.get(g.ticker);
      if (hit) {
        hit.gainBase += g.gainBase;
        hit.count += 1;
      } else {
        map.set(g.ticker, { ticker: g.ticker, gainBase: g.gainBase, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.gainBase - a.gainBase);
  }, [gains]);

  const availableYears = useMemo(() => {
    const years = new Set(yearlyTotals.map((tt) => tt.year));
    const current = new Date().getFullYear();
    years.add(current);
    return [...years].sort((a, b) => b - a);
  }, [yearlyTotals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={year}
            onChange={(e) =>
              setYear(e.target.value === "all" ? "all" : parseInt(e.target.value))
            }
            className="input w-auto"
          >
            <option value="all">{t("allYears")}</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <a
            href={`/api/realized-gains/export${year !== "all" ? `?year=${year}` : ""}`}
            className="btn"
          >
            <Download size={14} />
            {t("csv")}
          </a>
        </div>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("description", {
          currency: baseCurrency,
          pauschbetrag: fmtCurrency(SPARER_PAUSCHBETRAG, "EUR"),
        })}{" "}
        <strong>{t("noAdvice")}</strong>
        {t("noAdviceSuffix")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label={t("netPL")}
              value={fmtCurrency(summary.gross, baseCurrency)}
              highlight={summary.gross >= 0 ? "green" : "red"}
            />
            <Stat
              label={t("gains")}
              value={fmtCurrency(summary.profits, baseCurrency)}
              hint={t("tradesCount", { count: summary.winCount })}
            />
            <Stat
              label={t("losses")}
              value={fmtCurrency(summary.losses, baseCurrency)}
              hint={t("tradesCount", { count: summary.lossCount })}
            />
            <Stat
              label={t("trades")}
              value={String(summary.tradeCount)}
              hint={year === "all" ? t("sinceStart") : t("inYear", { year })}
            />
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="font-semibold">{t("taxEstimate")}</h2>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <KV k={t("kv.gross")} v={fmtCurrency(summary.gross, baseCurrency)} />
              <KV
                k={t("kv.pauschbetrag")}
                v={`− ${fmtCurrency(Math.min(SPARER_PAUSCHBETRAG, Math.max(0, summary.gross)), "EUR")}`}
              />
              <KV
                k={t("kv.taxable")}
                v={fmtCurrency(summary.afterPauschbetrag, baseCurrency)}
              />
              <KV
                k={t("kv.abgeltung")}
                v={fmtCurrency(summary.estAbgeltung, baseCurrency)}
              />
              <KV k={t("kv.soli")} v={fmtCurrency(summary.estSoli, baseCurrency)} />
              <KV
                k={t("kv.estTotal")}
                v={fmtCurrency(summary.estTotal, baseCurrency)}
                strong
              />
            </div>
            <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
              {t("taxNotice")}
            </div>
          </div>

          {yearlyTotals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("yearlyHistory")}
              </h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-3">{t("yearlyHeaders.year")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("yearlyHeaders.trades")}</th>
                      <th className="text-right font-medium px-3 py-3">
                        {t("yearlyHeaders.netPL", { currency: baseCurrency })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyTotals.map((y) => (
                      <tr
                        key={y.year}
                        className={`border-b border-[var(--border)] last:border-b-0 ${y.year === year ? "bg-[var(--surface-2)]" : ""}`}
                      >
                        <td className="px-3 py-2 num">{y.year}</td>
                        <td className="px-3 py-2 text-right num">{y.count}</td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            y.total >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }`}
                        >
                          {y.total >= 0 ? "+" : ""}
                          {fmtCurrency(y.total, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {byTicker.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("byTicker")}
              </h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-3">{t("tickerHeaders.ticker")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("tickerHeaders.trades")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("tickerHeaders.pnl")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTicker.map((tk) => (
                      <tr
                        key={tk.ticker}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-3 py-2 font-medium">{tk.ticker}</td>
                        <td className="px-3 py-2 text-right num">{tk.count}</td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            tk.gainBase >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }`}
                        >
                          {tk.gainBase >= 0 ? (
                            <TrendingUp size={12} className="inline mr-1" />
                          ) : (
                            <TrendingDown size={12} className="inline mr-1" />
                          )}
                          {tk.gainBase >= 0 ? "+" : ""}
                          {fmtCurrency(tk.gainBase, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {gains.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("singleTransactions")}
              </h2>
              <div className="card overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-3">{t("singleHeaders.date")}</th>
                      <th className="text-left font-medium px-3 py-3">{t("singleHeaders.ticker")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("singleHeaders.shares")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("singleHeaders.buy")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("singleHeaders.sell")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("singleHeaders.currency")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("singleHeaders.pnlIn", { currency: baseCurrency })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gains.map((g) => (
                      <tr
                        key={g._id}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">
                          {new Date(g.saleDate).toLocaleDateString(numberLocale)}
                        </td>
                        <td className="px-3 py-2 font-medium">{g.ticker}</td>
                        <td className="px-3 py-2 text-right num">
                          {fmtNumber(g.shares, numberLocale, 4)}
                        </td>
                        <td className="px-3 py-2 text-right num">
                          {fmtNumber(g.avgBuyPrice, numberLocale, 2)}
                        </td>
                        <td className="px-3 py-2 text-right num">
                          {fmtNumber(g.sellPrice, numberLocale, 2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[var(--muted)]">
                          {g.currency}
                        </td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            g.gainBase >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }`}
                        >
                          {g.gainBase >= 0 ? "+" : ""}
                          {fmtCurrency(g.gainBase, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && gains.length === 0 && (
            <div className="card p-8 text-center text-[var(--muted)]">
              {t("noGains")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: "green" | "red";
}) {
  const color =
    highlight === "green"
      ? "text-[var(--green)]"
      : highlight === "red"
        ? "text-[var(--red)]"
        : "";
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold num ${color}`}>{value}</div>
      {hint && <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>}
    </div>
  );
}

function KV({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <div className="text-[var(--muted)]">{k}</div>
      <div className={`num text-right ${strong ? "font-semibold" : ""}`}>{v}</div>
    </>
  );
}
