"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  GitBranch,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { fmtNumber, fmtPercent } from "@/lib/format";

interface Pair {
  a: string;
  b: string;
  r: number;
}

interface PerTicker {
  ticker: string;
  name?: string;
  beta: number;
  volatility: number;
  avgCorrelation: number;
  dataPoints: number;
}

interface Payload {
  tickers: string[];
  matrix: number[][];
  pairs: Pair[];
  perTicker: PerTicker[];
  benchmark: string;
  range: string;
  warnings: string[];
}

const BENCHMARKS = [
  { value: "^GSPC", label: "S&P 500" },
  { value: "^NDX", label: "Nasdaq 100" },
  { value: "^GDAXI", label: "DAX" },
  { value: "^STOXX50E", label: "Euro Stoxx 50" },
  { value: "^N225", label: "Nikkei 225" },
];

function corrColor(r: number): string {
  // r in [-1,1]; +1 rot (starke positive Korrelation = weniger Diversifikation), -1 grün
  const abs = Math.min(1, Math.abs(r));
  if (r >= 0) {
    const alpha = abs * 0.7;
    return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
  }
  const alpha = abs * 0.7;
  return `rgba(34, 197, 94, ${alpha.toFixed(3)})`;
}

export default function CorrelationsPage() {
  const t = useTranslations("Portfolio");
  const tc = useTranslations("Portfolio.correlations");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState("^GSPC");
  const [range, setRange] = useState("6mo");

  const RANGES = [
    { value: "3mo", label: tc("ranges.3mo") },
    { value: "6mo", label: tc("ranges.6mo") },
    { value: "1y", label: tc("ranges.1y") },
    { value: "2y", label: tc("ranges.2y") },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolio/correlations?benchmark=${encodeURIComponent(benchmark)}&range=${range}`
      );
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tc("loadError"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("loadError"));
    } finally {
      setLoading(false);
    }
  }, [benchmark, range, tc]);

  useEffect(() => {
    load();
  }, [load]);

  const benchmarkLabel =
    BENCHMARKS.find((b) => b.value === benchmark)?.label || benchmark;

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
          <GitBranch size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">
            {tc("title")}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="input w-auto"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="input w-auto"
          >
            {BENCHMARKS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <button onClick={load} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {tc("description", { benchmark: benchmarkLabel })}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {tc("loading")}
        </div>
      ) : !data || data.tickers.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {tc("noData")}
        </div>
      ) : (
        <>
          {data.warnings.length > 0 && (
            <div className="card p-3 text-xs text-yellow-400 space-y-1">
              {data.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Info size={12} /> {w}
                </div>
              ))}
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              {tc("perTicker", { benchmark: benchmarkLabel })}
            </h2>
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="text-left font-medium px-3 py-3">{tc("ticker")}</th>
                    <th className="text-right font-medium px-3 py-3">{tc("beta")}</th>
                    <th className="text-right font-medium px-3 py-3">{tc("volatility")}</th>
                    <th className="text-right font-medium px-3 py-3">
                      {tc("avgCorrelation")}
                    </th>
                    <th className="text-right font-medium px-3 py-3">{tc("dataPoints")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perTicker.map((t) => (
                    <tr
                      key={t.ticker}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/analysis/${encodeURIComponent(t.ticker)}`}
                          className="font-medium hover:text-[var(--accent)]"
                        >
                          {t.ticker}
                        </Link>
                        {t.name && (
                          <div className="text-xs text-[var(--muted)]">
                            {t.name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right num">
                        <span
                          className={
                            Math.abs(t.beta) > 1.5
                              ? "text-yellow-400"
                              : t.beta < 0
                                ? "text-[var(--green)]"
                                : ""
                          }
                        >
                          {fmtNumber(t.beta, numberLocale, 2)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num">
                        {fmtPercent(t.volatility * 100)}
                      </td>
                      <td className="px-3 py-2 text-right num">
                        <span
                          className={
                            t.avgCorrelation > 0.7
                              ? "text-[var(--red)]"
                              : t.avgCorrelation < 0.3
                                ? "text-[var(--green)]"
                                : ""
                          }
                        >
                          {fmtNumber(t.avgCorrelation, numberLocale, 2)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--muted)] num">
                        {t.dataPoints}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              {tc("matrix")}
            </h2>
            <div className="card p-4 overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="p-2"></th>
                    {data.tickers.map((t) => (
                      <th key={t} className="px-2 py-1 font-medium">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tickers.map((a, i) => (
                    <tr key={a}>
                      <th className="px-2 py-1 text-right font-medium">{a}</th>
                      {data.matrix[i].map((r, j) => (
                        <td
                          key={j}
                          className="text-center num border border-[var(--border)]"
                          style={{
                            backgroundColor: i === j ? "transparent" : corrColor(r),
                            minWidth: "52px",
                            padding: "6px",
                          }}
                          title={`${a} ↔ ${data.tickers[j]}: ${r.toFixed(3)}`}
                          aria-label={tc("matrixAria", { a, b: data.tickers[j], r: r.toFixed(3) })}
                        >
                          {i === j ? "1.00" : fmtNumber(r, numberLocale, 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-4 border border-[var(--border)]"
                    style={{ background: "rgba(34, 197, 94, 0.5)" }}
                  />
                  {tc("strongNegative")}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-4 border border-[var(--border)]"
                  />
                  {tc("neutral")}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-4 border border-[var(--border)]"
                    style={{ background: "rgba(239, 68, 68, 0.5)" }}
                  />
                  {tc("strongPositive")}
                </span>
              </div>
            </div>
          </div>

          {data.pairs.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {tc("extremePairs")}
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card p-3">
                  <div className="text-xs text-[var(--muted)] mb-2 flex items-center gap-1">
                    <TrendingUp size={12} className="text-[var(--red)]" />
                    {tc("highestPositive")}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {data.pairs
                      .filter((p) => p.r > 0)
                      .slice(0, 5)
                      .map((p, i) => (
                        <li key={i} className="flex justify-between">
                          <span>
                            {p.a} ↔ {p.b}
                          </span>
                          <span className="num text-[var(--red)]">
                            {fmtNumber(p.r, numberLocale, 2)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div className="card p-3">
                  <div className="text-xs text-[var(--muted)] mb-2 flex items-center gap-1">
                    <TrendingDown size={12} className="text-[var(--green)]" />
                    {tc("strongestDiversification")}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {[...data.pairs]
                      .sort((a, b) => a.r - b.r)
                      .slice(0, 5)
                      .map((p, i) => (
                        <li key={i} className="flex justify-between">
                          <span>
                            {p.a} ↔ {p.b}
                          </span>
                          <span
                            className={`num ${p.r < 0 ? "text-[var(--green)]" : ""}`}
                          >
                            {fmtNumber(p.r, numberLocale, 2)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
