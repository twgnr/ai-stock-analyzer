"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { type IndicatorKey } from "@/lib/chartIndicators";

interface IndicatorItem {
  key: string;
  label: string;
  signal: "bullish" | "bearish" | "neutral";
  currentValue?: string;
  interpretation: string;
}

interface AnalysisResult {
  overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  overallReasoning: string;
  indicatorAnalysis: IndicatorItem[];
  divergences: string[];
  keyObservations: string[];
  riskFactors: string[];
  suggestedActions: string[];
  ticker: string;
  range: string;
  indicatorCount: number;
}

interface Props {
  ticker: string;
  range: string;
  indicators: Set<IndicatorKey>;
}

const SIGNAL_COLORS: Record<string, string> = {
  BULLISH: "text-[var(--green)] bg-green-500/10 border-green-500/30",
  BEARISH: "text-[var(--red)] bg-red-500/10 border-red-500/30",
  NEUTRAL: "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--border)]",
};

const MINI_SIGNAL_COLORS: Record<string, string> = {
  bullish: "text-[var(--green)] bg-green-500/10",
  bearish: "text-[var(--red)] bg-red-500/10",
  neutral: "text-[var(--muted)] bg-[var(--surface-2)]",
};

function SignalIcon({ signal }: { signal: string }) {
  if (signal === "bullish" || signal === "BULLISH")
    return <TrendingUp size={14} className="text-[var(--green)]" />;
  if (signal === "bearish" || signal === "BEARISH")
    return <TrendingDown size={14} className="text-[var(--red)]" />;
  return <Minus size={14} className="text-[var(--muted)]" />;
}

export function ChartIndicatorAnalysis({ ticker, range, indicators }: Props) {
  const t = useTranslations("AnalysisPanels.indicators");
  const tCommon = useTranslations("AnalysisPanels.common");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = indicators.size;
  const disabled = activeCount === 0;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          range,
          indicators: [...indicators],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }

  const signalLabel = (signal: string) => {
    if (signal === "BULLISH" || signal === "BEARISH" || signal === "NEUTRAL") {
      return t(`signals.${signal}` as "signals.BULLISH" | "signals.BEARISH" | "signals.NEUTRAL");
    }
    return signal;
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
          {activeCount > 0 && (
            <span className="text-xs text-[var(--muted)]">
              {activeCount === 1
                ? t("activeCountOne", { count: activeCount })
                : t("activeCountOther", { count: activeCount })}
            </span>
          )}
        </div>
        <button
          onClick={run}
          disabled={disabled || loading}
          className="btn btn-primary"
          title={disabled ? t("tooltipNoIndicators") : undefined}
        >
          {loading ? <div className="spinner" /> : <Sparkles size={14} />}
          {loading ? t("evaluating") : t("evaluate")}
        </button>
      </div>

      {disabled && !result && (
        <p className="text-xs text-[var(--muted)]">{t("needIndicators")}</p>
      )}

      {error && (
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4 pt-2 border-t border-[var(--border)]">
          <div
            className={`rounded-md p-3 border flex items-start gap-3 ${SIGNAL_COLORS[result.overallSignal] || SIGNAL_COLORS.NEUTRAL}`}
          >
            <SignalIcon signal={result.overallSignal} />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">
                  {t("overallSignal", { signal: signalLabel(result.overallSignal) })}
                </span>
                <span className="text-xs">
                  {t("confidence", { pct: Math.round(result.confidence * 100) })}
                </span>
                <span className="text-xs">
                  {t("indicatorsEvaluated", { count: result.indicatorCount })}
                </span>
              </div>
              <p className="text-sm mt-1">{result.overallReasoning}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
              {t("perIndicator")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {result.indicatorAnalysis.map((ind, i) => (
                <div
                  key={i}
                  className="border border-[var(--border)] rounded-md p-3 bg-[var(--surface-2)]/50"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{ind.label}</div>
                      {ind.currentValue && (
                        <div className="text-xs text-[var(--muted)] num">
                          {t("valuePrefix", { value: ind.currentValue })}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${MINI_SIGNAL_COLORS[ind.signal]}`}
                    >
                      <SignalIcon signal={ind.signal} />
                      {ind.signal}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed">{ind.interpretation}</p>
                </div>
              ))}
            </div>
          </div>

          {result.divergences?.length > 0 && (
            <div>
              <h3 className="text-xs text-yellow-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {t("divergences")}
              </h3>
              <ul className="text-sm space-y-1">
                {result.divergences.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-yellow-400">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {result.keyObservations?.length > 0 && (
              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t("observations")}
                </h3>
                <ul className="text-sm space-y-1">
                  {result.keyObservations.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--accent)]">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.riskFactors?.length > 0 && (
              <div>
                <h3 className="text-xs text-[var(--red)] uppercase tracking-wider mb-1">
                  {t("risks")}
                </h3>
                <ul className="text-sm space-y-1">
                  {result.riskFactors.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--red)]">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.suggestedActions?.length > 0 && (
            <div className="border-t border-[var(--border)] pt-3">
              <h3 className="text-xs text-[var(--accent)] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Lightbulb size={12} /> {t("nextSteps")}
              </h3>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                {result.suggestedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}
