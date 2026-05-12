"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Zap, AlertCircle, Sparkles, TrendingUp, Clock } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent, changeClass } from "@/lib/format";
import { WatchlistButton } from "@/components/WatchlistButton";
import { Sparkline } from "@/components/Sparkline";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import {
  saveState,
  loadState,
  clearState,
  formatAge,
  ageHighlightClass,
} from "@/lib/storage";

type Region = "DE" | "EU" | "US" | "AS";

interface BreakoutRow {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  changePercent: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  region: Region;
  analysis: {
    score: number;
    reasons: string[];
    signals: {
      distFrom52WHigh: number;
      bollingerBandwidth: number | null;
      sma20: number | null;
      sma50: number | null;
      sma200: number | null;
      rsi14: number | null;
      volumeRatio: number | null;
      trendAligned: boolean;
      hasConsolidation: boolean;
      rsiHealthy: boolean;
      volumeDryUp: boolean;
      nearHigh: boolean;
    };
  };
  catalysts?: {
    catalystScore: number;
    reasons: string[];
    wikiSpike?: number | null;
    trendsSpike?: number | null;
    recentNewsCount?: number;
    risingQueries?: string[];
  };
  totalScore?: number;
}

interface SignalResult {
  ticker: string;
  name?: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  error?: string;
}

const REGION_KEYS: Region[] = ["DE", "EU", "US", "AS"];

const MIN_SCORES = [40, 50, 60, 70];

function scoreColor(score: number): string {
  if (score >= 70) return "text-[var(--green)]";
  if (score >= 55) return "text-yellow-400";
  return "text-[var(--muted)]";
}

export default function BreakoutPage() {
  const t = useTranslations("Breakout");
  const tAge = useTranslations("Format.age");
  const locale = useLocale();
  const localeForNumber = locale === "de" ? "de-DE" : "en-US";
  const [regions, setRegions] = useState<Set<Region>>(new Set(["DE", "EU", "US", "AS"]));
  const [minScore, setMinScore] = useState(50);
  const [withCatalysts, setWithCatalysts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BreakoutRow[]>([]);
  const [meta, setMeta] = useState<{
    total: number;
    matches: number;
    catalystsApplied?: number;
  } | null>(null);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [signals, setSignals] = useState<SignalResult[] | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  useEffect(() => {
    const saved = loadState<{
      regions: Region[];
      minScore: number;
      withCatalysts: boolean;
      results: BreakoutRow[];
      meta: { total: number; matches: number; catalystsApplied?: number } | null;
      sparklines: Record<string, number[]>;
      signals: SignalResult[] | null;
    }>("breakout");
    if (saved) {
      if (Array.isArray(saved.regions) && saved.regions.length > 0) {
        setRegions(new Set(saved.regions));
      }
      if (typeof saved.minScore === "number") setMinScore(saved.minScore);
      if (typeof saved.withCatalysts === "boolean") setWithCatalysts(saved.withCatalysts);
      if (Array.isArray(saved.results)) setResults(saved.results);
      if (saved.meta) setMeta(saved.meta);
      if (saved.sparklines) setSparklines(saved.sparklines);
      if (saved.signals) setSignals(saved.signals);
      setLastScanAt(saved._ts);
    }
  }, []);

  function persistSnapshot(patch: {
    results?: BreakoutRow[];
    meta?: { total: number; matches: number; catalystsApplied?: number } | null;
    sparklines?: Record<string, number[]>;
    signals?: SignalResult[] | null;
  }) {
    const snapshot = {
      regions: Array.from(regions),
      minScore,
      withCatalysts,
      results: patch.results ?? results,
      meta: patch.meta ?? meta,
      sparklines: patch.sparklines ?? sparklines,
      signals: patch.signals ?? signals,
    };
    saveState("breakout", snapshot);
    setLastScanAt(Date.now());
  }

  function resetResults() {
    setResults([]);
    setMeta(null);
    setSparklines({});
    setSignals(null);
    setLastScanAt(null);
    clearState("breakout");
  }

  function toggleRegion(r: Region) {
    const next = new Set(regions);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    if (next.size === 0) next.add(r);
    setRegions(next);
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResults([]);
    setSparklines({});
    setSignals(null);
    try {
      const res = await fetch("/api/breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regions: Array.from(regions),
          minScore,
          withCatalysts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorScan"));
      const newResults = data.results as BreakoutRow[];
      const newMeta = {
        total: data.total,
        matches: data.matches,
        catalystsApplied: data.catalystsApplied,
      };
      setResults(newResults);
      setMeta(newMeta);
      persistSnapshot({
        results: newResults,
        meta: newMeta,
        sparklines: {},
        signals: null,
      });

      const topTickers = newResults.slice(0, 20).map((r) => r.ticker);
      if (topTickers.length > 0) {
        fetch("/api/stocks/sparklines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: topTickers }),
        })
          .then((r) => r.json())
          .then((sd) => {
            const sparks = sd || {};
            setSparklines(sparks);
            persistSnapshot({ sparklines: sparks });
          })
          .catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function runSignalScan() {
    if (results.length === 0) return;
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const tickers =
        selected.size > 0
          ? Array.from(selected).slice(0, 10)
          : results.slice(0, 5).map((r) => r.ticker);
      const res = await fetch("/api/screener/analyze-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorSignals"));
      setSignals(data.results);
      persistSnapshot({ signals: data.results });
    } catch (e) {
      setSignalsError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSignalsLoading(false);
    }
  }

  function toggleSelect(ticker: string) {
    const next = new Set(selected);
    if (next.has(ticker)) next.delete(ticker);
    else if (next.size < 10) next.add(ticker);
    setSelected(next);
  }

  function selectAllVisible() {
    setSelected(new Set(results.slice(0, 10).map((r) => r.ticker)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Zap className="text-yellow-400" size={24} />
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {t("description")}
        </p>
      </div>

      <div className="card p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("regionsLabel")}</label>
          <div className="flex flex-wrap gap-2">
            {REGION_KEYS.map((r) => (
              <button
                key={r}
                onClick={() => toggleRegion(r)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  regions.has(r)
                    ? "border-[var(--accent)] bg-blue-500/10 text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {t(`regions.${r}` as `regions.${Region}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("minScoreLabel")}
          </label>
          <div className="flex gap-2">
            {MIN_SCORES.map((s) => (
              <button
                key={s}
                onClick={() => setMinScore(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  minScore === s
                    ? "border-[var(--accent)] bg-blue-500/10 text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                ≥ {s}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-[var(--border)] rounded-md p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={withCatalysts}
              onChange={(e) => setWithCatalysts(e.target.checked)}
              className="mt-1 accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--accent)]" aria-hidden="true" />
                {t("catalystsTitle")}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {t("catalystsDescription")}
              </div>
            </div>
          </label>
        </div>

        <button onClick={run} disabled={loading} className="btn btn-primary">
          {loading ? <div className="spinner" /> : <Zap size={14} />}
          {loading
            ? withCatalysts
              ? t("scanningCatalysts")
              : t("scanning")
            : t("startScan")}
        </button>
      </div>

      {error && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {meta && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-[var(--muted)] flex items-center gap-3 flex-wrap">
            <span>
              {t("matchesSummary", { matches: meta.matches, total: meta.total, minScore })}
              {typeof meta.catalystsApplied === "number" && meta.catalystsApplied > 0 && (
                <>
                  {" "}
                  <span className="text-[var(--accent)]">
                    {t("catalystsApplied", { count: meta.catalystsApplied })}
                  </span>
                </>
              )}
            </span>
            {lastScanAt && (
              <span
                className={`flex items-center gap-1 text-xs ${ageHighlightClass(lastScanAt)}`}
              >
                <Clock size={12} />
                {(() => {
                  const a = formatAge(lastScanAt);
                  return tAge(a.key, a.values);
                })()}
                <button
                  onClick={resetResults}
                  className="ml-1 text-[var(--muted)] hover:text-[var(--red)] underline underline-offset-2"
                  title={t("discardSaved")}
                >
                  {t("discard")}
                </button>
              </span>
            )}
          </div>
          {results.length > 0 && (
            <div className="flex gap-2 items-center">
              {selected.size > 0 && (
                <button onClick={clearSelection} className="btn text-xs">
                  {t("clearSelection")}
                </button>
              )}
              <button onClick={runSignalScan} disabled={signalsLoading} className="btn btn-primary">
                {signalsLoading ? <div className="spinner" /> : <Sparkles size={14} />}
                {signalsLoading
                  ? t("aiAnalyzing")
                  : selected.size > 0
                  ? t("checkSelection", { count: selected.size })
                  : t("checkTop5")}
              </button>
            </div>
          )}
        </div>
      )}

      {signalsError && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {signalsError}
        </div>
      )}

      {signals && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
            {t("top5Heading")}
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {signals.map((s) => (
              <div key={s.ticker} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/analysis/${encodeURIComponent(s.ticker)}`} className="flex-1">
                    <div className="font-semibold">{s.ticker}</div>
                    <div className="text-xs text-[var(--muted)] truncate">{s.name}</div>
                  </Link>
                  {s.recommendation && <RecommendationBadge recommendation={s.recommendation} />}
                </div>
                {s.error ? (
                  <p className="text-sm text-[var(--red)]">{s.error}</p>
                ) : (
                  <>
                    {s.summary && <p className="text-sm font-medium">{s.summary}</p>}
                    {s.reasoning && (
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{s.reasoning}</p>
                    )}
                    {s.confidence != null && (
                      <div className="text-xs text-[var(--muted)]">
                        {t("confidence", { pct: Math.round(s.confidence * 100) })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      results.length > 0 &&
                      results.slice(0, 10).every((r) => selected.has(r.ticker))
                    }
                    onChange={(e) =>
                      e.target.checked ? selectAllVisible() : clearSelection()
                    }
                    className="accent-[var(--accent)] cursor-pointer"
                    title={t("selectTop10Title")}
                  />
                </th>
                <th className="text-left font-medium px-3 py-3">#</th>
                <th className="text-left font-medium px-3 py-3">{t("table.ticker")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.score")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.price")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.today")}</th>
                <th className="text-left font-medium px-3 py-3">{t("table.threeMonths")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.toHigh")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.rsi")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.range")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.volRatio")}</th>
                <th className="text-left font-medium px-3 py-3">{t("table.signals")}</th>
                <th className="w-40"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.ticker}
                  className={`border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] ${
                    selected.has(r.ticker) ? "bg-blue-500/5" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.ticker)}
                      onChange={() => toggleSelect(r.ticker)}
                      disabled={!selected.has(r.ticker) && selected.size >= 10}
                      className="accent-[var(--accent)] cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3 text-[var(--muted)] num">{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/analysis/${encodeURIComponent(r.ticker)}`} className="block">
                      <div className="font-semibold flex items-center gap-2">
                        {r.ticker}
                        <span className="text-[10px] text-[var(--muted)] border border-[var(--border)] px-1 rounded">
                          {r.region}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--muted)] truncate max-w-[180px]">
                        {r.name}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right num font-bold">
                    {r.catalysts && r.catalysts.catalystScore > 0 ? (
                      <div className="leading-tight">
                        <div className={scoreColor(r.totalScore ?? r.analysis.score)}>
                          {r.totalScore ?? r.analysis.score}
                        </div>
                        <div className="text-[10px] text-[var(--accent)] font-normal">
                          {r.analysis.score}+{r.catalysts.catalystScore}
                        </div>
                      </div>
                    ) : (
                      <span className={scoreColor(r.analysis.score)}>{r.analysis.score}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtCurrency(r.price, r.currency)}</td>
                  <td className={`px-3 py-3 text-right num ${changeClass(r.changePercent)}`}>
                    {fmtPercent(r.changePercent)}
                  </td>
                  <td className="px-3 py-3">
                    {sparklines[r.ticker] ? (
                      <Sparkline data={sparklines[r.ticker]} width={100} height={26} />
                    ) : (
                      <div className="w-[100px] h-[26px] opacity-20 text-[10px] text-[var(--muted)] flex items-center">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {fmtNumber(r.analysis.signals.distFrom52WHigh * 100, localeForNumber, 1)}%
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {r.analysis.signals.rsi14 != null
                      ? fmtNumber(r.analysis.signals.rsi14, localeForNumber, 0)
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {r.analysis.signals.bollingerBandwidth != null
                      ? fmtNumber(r.analysis.signals.bollingerBandwidth * 100, localeForNumber, 1) + "%"
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {r.analysis.signals.volumeRatio != null
                      ? r.analysis.signals.volumeRatio.toFixed(2) + "×"
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {r.analysis.reasons.slice(0, 4).map((m, j) => (
                        <span
                          key={j}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]"
                        >
                          {m}
                        </span>
                      ))}
                      {r.catalysts?.reasons.map((m, j) => (
                        <span
                          key={`c-${j}`}
                          title={t("catalystSignal")}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 inline-flex items-center gap-0.5"
                        >
                          <Sparkles size={9} aria-hidden="true" />
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-end">
                      <WatchlistButton ticker={r.ticker} name={r.name} size="sm" />
                      <Link
                        href={`/analysis/${encodeURIComponent(r.ticker)}`}
                        className="btn text-xs px-2 py-1"
                      >
                        <TrendingUp size={12} />
                        {t("analysis")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && results.length === 0 && meta && meta.matches === 0 && (
        <div className="card p-6 text-center text-[var(--muted)] text-sm">
          {t("noMatches", { minScore })}
        </div>
      )}

      {results.length > 0 && (
        <div className="text-xs text-[var(--muted)]">
          {t.rich("scoreNote", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
      )}
    </div>
  );
}
