"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  BarChart3,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";

interface MonthlyReturn {
  month: string;
  returnPct: number;
}

interface Metrics {
  twrPct: number;
  twrAnnualizedPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownStart?: string;
  maxDrawdownEnd?: string;
  volatilityPct: number;
  downsideVolatilityPct: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  dataPoints: number;
  simpleReturnPct: number;
  monthlyReturns: MonthlyReturn[];
}

interface Payload {
  metrics: Metrics | null;
  reason?: string;
  baseCurrency: string;
  riskFreeRatePct: number;
}

function monthlyColor(r: number): string {
  const abs = Math.min(10, Math.abs(r));
  const alpha = (abs / 10) * 0.7;
  if (r >= 0) return `rgba(34, 197, 94, ${alpha.toFixed(3)})`;
  return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
}

export default function MetricsPage() {
  const t = useTranslations("Portfolio");
  const tm = useTranslations("Portfolio.metrics");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";

  const MONTHS = useMemo(
    () => [
      tm("monthJan"),
      tm("monthFeb"),
      tm("monthMar"),
      tm("monthApr"),
      tm("monthMay"),
      tm("monthJun"),
      tm("monthJul"),
      tm("monthAug"),
      tm("monthSep"),
      tm("monthOct"),
      tm("monthNov"),
      tm("monthDec"),
    ],
    [tm]
  );

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rfPct, setRfPct] = useState(3);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/metrics?rf=${rfPct}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tm("loadError"));
    } finally {
      setLoading(false);
    }
  }, [rfPct, tm]);

  useEffect(() => {
    load();
  }, [load]);

  const heatmap = useMemo(() => {
    if (!data?.metrics) return { years: [] as number[], byYear: new Map<number, Map<number, number>>() };
    const byYear = new Map<number, Map<number, number>>();
    for (const m of data.metrics.monthlyReturns) {
      const [yStr, mStr] = m.month.split("-");
      const y = parseInt(yStr);
      const mm = parseInt(mStr) - 1;
      if (!byYear.has(y)) byYear.set(y, new Map());
      byYear.get(y)!.set(mm, m.returnPct);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a);
    return { years, byYear };
  }, [data]);

  function sharpeLabel(s: number): string {
    if (s >= 2) return tm("sharpeExcellent");
    if (s >= 1) return tm("sharpeGood");
    if (s >= 0.5) return tm("sharpeAcceptable");
    if (s >= 0) return tm("sharpeWeak");
    return tm("sharpeNegative");
  }

  return (
    <div className="space-y-6">
      <Link
        href="/portfolio"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("backToPortfolio")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{tm("title")}</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-xs text-[var(--muted)] flex items-center gap-2">
            {tm("riskFreeRate")}
            <input
              type="number"
              value={rfPct}
              onChange={(e) => setRfPct(Number(e.target.value) || 0)}
              step={0.5}
              min={0}
              max={10}
              className="input w-20 text-right"
            />
            % p.a.
          </label>
          <button onClick={load} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {tm("description")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {tm("loading")}
        </div>
      ) : !data?.metrics ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {data?.reason || tm("noData")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label={tm("twrTotal")}
              value={`${data.metrics.twrPct >= 0 ? "+" : ""}${fmtPercent(data.metrics.twrPct)}`}
              tone={data.metrics.twrPct >= 0 ? "green" : "red"}
              hint={tm("vsSimple", {
                value: `${data.metrics.simpleReturnPct >= 0 ? "+" : ""}${fmtPercent(data.metrics.simpleReturnPct)}`,
              })}
            />
            <Stat
              label={tm("twrAnnual")}
              value={`${data.metrics.twrAnnualizedPct >= 0 ? "+" : ""}${fmtPercent(data.metrics.twrAnnualizedPct)}`}
              tone={data.metrics.twrAnnualizedPct >= 0 ? "green" : "red"}
              hint={tm("days", { count: data.metrics.totalDays })}
            />
            <Stat
              label={tm("maxDrawdown")}
              value={`−${fmtPercent(data.metrics.maxDrawdownPct)}`}
              tone="red"
              hint={
                data.metrics.maxDrawdownEnd
                  ? tm("until", {
                      date: new Date(data.metrics.maxDrawdownEnd).toLocaleDateString(numberLocale),
                    })
                  : undefined
              }
            />
            <Stat
              label={tm("volatility")}
              value={fmtPercent(data.metrics.volatilityPct)}
              hint={tm("downside", { value: fmtPercent(data.metrics.downsideVolatilityPct) })}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label={tm("sharpe")}
              value={fmtNumber(data.metrics.sharpe, numberLocale, 2)}
              tone={data.metrics.sharpe > 1 ? "green" : data.metrics.sharpe < 0 ? "red" : undefined}
              hint={sharpeLabel(data.metrics.sharpe)}
            />
            <Stat
              label={tm("sortino")}
              value={fmtNumber(data.metrics.sortino, numberLocale, 2)}
              tone={data.metrics.sortino > 1 ? "green" : data.metrics.sortino < 0 ? "red" : undefined}
              hint={tm("sortinoHint")}
            />
            <Stat
              label={tm("dataPoints")}
              value={String(data.metrics.dataPoints)}
              hint={tm("since", {
                date: new Date(data.metrics.startDate).toLocaleDateString(numberLocale),
              })}
            />
            <Stat
              label={tm("drawdownAmount")}
              value={fmtCurrency(data.metrics.maxDrawdownAmount, data.baseCurrency)}
              tone="red"
              hint={
                data.metrics.maxDrawdownStart
                  ? tm("from", {
                      date: new Date(data.metrics.maxDrawdownStart).toLocaleDateString(numberLocale),
                    })
                  : undefined
              }
            />
          </div>

          {heatmap.years.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-2">
                {tm("monthlyHeatmap")}
              </h2>
              <div className="card p-4 overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-2 text-left"></th>
                      {MONTHS.map((m) => (
                        <th key={m} className="px-2 py-1 font-medium text-center">
                          {m}
                        </th>
                      ))}
                      <th className="px-3 py-1 font-medium text-right">{tm("year")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmap.years.map((y) => {
                      const months = heatmap.byYear.get(y) || new Map();
                      let yearCompound = 1;
                      for (const v of months.values()) yearCompound *= 1 + v / 100;
                      const yearReturn = (yearCompound - 1) * 100;
                      return (
                        <tr key={y}>
                          <th className="px-2 py-1 text-right font-medium">{y}</th>
                          {MONTHS.map((_, i) => {
                            const v = months.get(i);
                            return (
                              <td
                                key={i}
                                className="text-center num border border-[var(--border)] text-xs"
                                style={{
                                  backgroundColor: v != null ? monthlyColor(v) : "transparent",
                                  minWidth: "48px",
                                  padding: "6px",
                                }}
                                title={
                                  v != null
                                    ? `${MONTHS[i]} ${y}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`
                                    : ""
                                }
                              >
                                {v != null
                                  ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}`
                                  : "—"}
                              </td>
                            );
                          })}
                          <td
                            className={`px-3 py-1 text-right num font-semibold ${
                              yearReturn >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                            }`}
                          >
                            {yearReturn >= 0 ? "+" : ""}
                            {yearReturn.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
                  <span className="flex items-center gap-1">
                    <TrendingDown size={12} className="text-[var(--red)]" />
                    {tm("negative")}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-[var(--green)]" />
                    {tm("positive")}
                  </span>
                  <span>{tm("intensityHint")}</span>
                </div>
              </div>
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
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)]"
      : tone === "red"
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
