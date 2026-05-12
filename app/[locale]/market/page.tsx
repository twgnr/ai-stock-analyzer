"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, AlertCircle, TrendingUp, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { WatchlistButton } from "@/components/WatchlistButton";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { MarketAttentionWidget } from "@/components/MarketAttentionWidget";
import { MarketNewsFeedWidget } from "@/components/MarketNewsFeedWidget";
import {
  saveState,
  loadState,
  clearState,
  formatAge,
  ageHighlightClass,
} from "@/lib/storage";

interface Idea {
  ticker: string;
  name: string;
  thesis: string;
  whyNow: string;
  risks: string[];
  suggestedAllocation: string;
}

interface RadarResult {
  marketOverview: string;
  sectorRotation: string;
  ideas: Idea[];
}

type Horizon = "long" | "swing" | "short";

interface DeepAnalysisResult {
  ticker: string;
  name?: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  error?: string;
}

export default function MarketRadarPage() {
  const t = useTranslations("Market");
  const tHorizon = useTranslations("Market.horizon");
  const tAge = useTranslations("Format.age");

  const HORIZONS: Array<{ value: Horizon; label: string; description: string }> = [
    {
      value: "long",
      label: tHorizon("long"),
      description: tHorizon("longDescription"),
    },
    {
      value: "swing",
      label: tHorizon("swing"),
      description: tHorizon("swingDescription"),
    },
    {
      value: "short",
      label: tHorizon("short"),
      description: tHorizon("shortDescription"),
    },
  ];

  const [focus, setFocus] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [result, setResult] = useState<RadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deepResults, setDeepResults] = useState<DeepAnalysisResult[] | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  useEffect(() => {
    const saved = loadState<{
      focus: string;
      horizon: Horizon;
      result: RadarResult | null;
      deepResults: DeepAnalysisResult[] | null;
    }>("market");
    if (saved) {
      if (saved.focus != null) setFocus(saved.focus);
      if (saved.horizon) setHorizon(saved.horizon);
      if (saved.result) setResult(saved.result);
      if (saved.deepResults) setDeepResults(saved.deepResults);
      setLastScanAt(saved._ts);
    }
  }, []);

  function persistSnapshot(patch: {
    focus?: string;
    horizon?: Horizon;
    result?: RadarResult | null;
    deepResults?: DeepAnalysisResult[] | null;
  }) {
    const snapshot = {
      focus: patch.focus ?? focus,
      horizon: patch.horizon ?? horizon,
      result: patch.result ?? result,
      deepResults: patch.deepResults ?? deepResults,
    };
    saveState("market", snapshot);
    setLastScanAt(Date.now());
  }

  function resetResults() {
    setResult(null);
    setDeepResults(null);
    setLastScanAt(null);
    clearState("market");
  }

  async function run() {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setDeepResults(null);
    try {
      const res = await fetch("/api/analyze/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: focus.trim() || undefined, horizon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("radarFailed"));
      setResult(data);
      persistSnapshot({ focus, horizon, result: data, deepResults: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("radarFailed"));
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(ticker: string) {
    const next = new Set(selected);
    if (next.has(ticker)) next.delete(ticker);
    else if (next.size < 10) next.add(ticker);
    setSelected(next);
  }

  function selectAll() {
    if (!result) return;
    setSelected(new Set(result.ideas.slice(0, 10).map((i) => i.ticker)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runDeepAnalysis() {
    if (selected.size === 0) return;
    setDeepLoading(true);
    setDeepError(null);
    try {
      const res = await fetch("/api/screener/analyze-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: Array.from(selected).slice(0, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("analysisFailed"));
      setDeepResults(data.results);
      persistSnapshot({ deepResults: data.results });
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MarketAttentionWidget />
        <MarketNewsFeedWidget />
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {tHorizon("label")}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {HORIZONS.map((h) => (
              <button
                key={h.value}
                onClick={() => setHorizon(h.value)}
                className={`p-3 rounded-md border text-left transition-colors ${
                  horizon === h.value
                    ? "border-[var(--accent)] bg-blue-500/10"
                    : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="text-sm font-semibold">{h.label}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">{h.description}</div>
              </button>
            ))}
          </div>
          {horizon === "short" && (
            <div className="mt-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
              {tHorizon("shortWarning")}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("focus.label")}
          </label>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={t("focus.placeholder")}
            className="input"
          />
        </div>
        <button onClick={run} disabled={loading} className="btn btn-primary">
          {loading ? <div className="spinner" /> : <Sparkles size={14} />}
          {loading ? t("scanning") : t("start")}
        </button>
      </div>

      {error && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp size={16} />
              {t("marketOverview")}
            </h2>
            <p className="text-sm">{result.marketOverview}</p>
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                {t("sectorRotation")}
              </div>
              <p className="text-sm">{result.sectorRotation}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
                  {t("ideas", { count: result.ideas.length })}
                </h2>
                {lastScanAt && (
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      ageHighlightClass(lastScanAt) || "text-[var(--muted)]"
                    }`}
                  >
                    <Clock size={12} />
                    {(() => {
                      const a = formatAge(lastScanAt);
                      return tAge(a.key, a.values);
                    })()}
                    <button
                      onClick={resetResults}
                      className="ml-1 hover:text-[var(--red)] underline underline-offset-2"
                      title={t("discardResults")}
                    >
                      {t("discard")}
                    </button>
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={selected.size === result.ideas.length ? clearSelection : selectAll}
                  className="btn text-xs"
                >
                  {selected.size === result.ideas.length ? t("clearSelection") : t("selectAll")}
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={runDeepAnalysis}
                    disabled={deepLoading}
                    className="btn btn-primary text-xs"
                  >
                    {deepLoading ? <div className="spinner" /> : <Sparkles size={12} />}
                    {deepLoading
                      ? t("aiAnalyzing")
                      : t("deepAnalyze", { count: selected.size })}
                  </button>
                )}
              </div>
            </div>

            {deepError && (
              <div className="card p-3 mb-3 text-sm text-[var(--red)] flex items-center gap-2">
                <AlertCircle size={14} /> {deepError}
              </div>
            )}

            {deepResults && (
              <div className="space-y-3 mb-4">
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  {t("deepCheckTitle")}
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {deepResults.map((s) => (
                    <div key={s.ticker} className="card p-4 space-y-2 border-[var(--accent)]/30">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/analysis/${encodeURIComponent(s.ticker)}`} className="flex-1">
                          <div className="font-semibold">{s.ticker}</div>
                          <div className="text-xs text-[var(--muted)] truncate">{s.name}</div>
                        </Link>
                        {s.recommendation && (
                          <RecommendationBadge recommendation={s.recommendation} />
                        )}
                      </div>
                      {s.error ? (
                        <p className="text-sm text-[var(--red)]">{s.error}</p>
                      ) : (
                        <>
                          {s.summary && <p className="text-sm font-medium">{s.summary}</p>}
                          {s.reasoning && (
                            <p className="text-xs text-[var(--muted)] leading-relaxed">
                              {s.reasoning}
                            </p>
                          )}
                          {s.confidence != null && (
                            <div className="text-xs text-[var(--muted)]">
                              {t("confidence", { percent: Math.round(s.confidence * 100) })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {result.ideas.map((idea, i) => {
                const isSelected = selected.has(idea.ticker);
                return (
                <div
                  key={i}
                  className={`card p-4 space-y-2 transition-colors ${
                    isSelected ? "border-[var(--accent)] bg-blue-500/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(idea.ticker)}
                        disabled={!isSelected && selected.size >= 10}
                        className="mt-1.5 accent-[var(--accent)] cursor-pointer"
                      />
                      <Link
                        href={`/analysis/${encodeURIComponent(idea.ticker)}`}
                        className="flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="font-semibold text-lg">{idea.ticker}</div>
                        <div className="text-sm text-[var(--muted)]">{idea.name}</div>
                      </Link>
                    </label>
                    <span className="text-xs text-[var(--accent)] bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded">
                      {idea.suggestedAllocation}
                    </span>
                  </div>
                  <div>
                    <WatchlistButton ticker={idea.ticker} name={idea.name} size="sm" />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{t("thesis")}</div>
                    <p className="text-sm">{idea.thesis}</p>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                      {t("whyNow")}
                    </div>
                    <p className="text-sm">{idea.whyNow}</p>
                  </div>
                  {idea.risks?.length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                        {t("risks")}
                      </div>
                      <ul className="text-sm space-y-0.5">
                        {idea.risks.map((r, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-[var(--red)]">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] text-center pt-4">
            {t("disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
