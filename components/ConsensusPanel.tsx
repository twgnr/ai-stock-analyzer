"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Sparkles, AlertCircle, Trophy, TrendingUp, Minus, Clock } from "lucide-react";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { EstimatedCostBadge } from "@/components/EstimatedCostBadge";
import type { AIProvider } from "@/lib/ai/types";

interface ProviderResult {
  provider: string;
  providerLabel: string;
  model: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  risks?: string[];
  opportunities?: string[];
  error?: string;
  durationMs: number;
}

interface ConsensusResponse {
  ticker: string;
  name: string;
  results: ProviderResult[];
  consensus: {
    recommendation?: string;
    agreement: number;
    label: "Einstimmig" | "Mehrheit" | "Gespalten";
    avgConfidence: number;
    providerCount: number;
    successfulCount: number;
    distribution: Record<string, number>;
  };
}

// Heuristik für single-stock-analyse: typischer Prompt mit Yahoo-Daten + News +
// Fundamentals ist ~14 KB groß, Output ~6 KB.
const CONSENSUS_PROMPT_BYTES_HINT = 14000;
const CONSENSUS_OUTPUT_TOKENS_HINT = 1500;

interface ProviderConfig {
  provider: AIProvider;
  model: string;
}

export function ConsensusPanel({ ticker }: { ticker: string }) {
  const t = useTranslations("AnalysisPanels.consensus");
  const tCommon = useTranslations("AnalysisPanels.common");
  const [result, setResult] = useState<ConsensusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  useEffect(() => {
    fetch("/api/ai/providers")
      .then((r) => r.json())
      .then((d) =>
        Array.isArray(d.providers) ? setProviders(d.providers) : setProviders([])
      )
      .catch(() => setProviders([]));
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
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

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 0 && (
            <EstimatedCostBadge
              providers={providers}
              promptText={"x".repeat(CONSENSUS_PROMPT_BYTES_HINT)}
              expectedOutputTokens={CONSENSUS_OUTPUT_TOKENS_HINT}
              hint={t("costHint")}
            />
          )}
          <button onClick={run} disabled={loading} className="btn btn-primary">
            {loading ? <div className="spinner" /> : <Sparkles size={14} />}
            {loading ? t("starting") : t("start")}
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {t("intro")}
      </p>

      {error && (
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          <div
            className={`rounded-md p-3 border ${
              result.consensus.label === "Einstimmig"
                ? "border-[var(--green)]/40 bg-green-500/5"
                : result.consensus.label === "Mehrheit"
                ? "border-yellow-500/30 bg-yellow-500/5"
                : "border-[var(--red)]/30 bg-red-500/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {result.consensus.label === "Einstimmig" ? (
                  <Trophy size={16} className="text-[var(--green)]" />
                ) : result.consensus.label === "Mehrheit" ? (
                  <TrendingUp size={16} className="text-yellow-400" />
                ) : (
                  <Minus size={16} className="text-[var(--red)]" />
                )}
                <span className="font-semibold">
                  {t(`labels.${result.consensus.label}` as Parameters<typeof t>[0])}
                </span>
                {result.consensus.recommendation && (
                  <RecommendationBadge recommendation={result.consensus.recommendation} />
                )}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {t("agreement", { pct: Math.round(result.consensus.agreement) })} ·{" "}
                {t("avgConfidence", { pct: Math.round(result.consensus.avgConfidence * 100) })} ·{" "}
                {t("successCount", {
                  ok: result.consensus.successfulCount,
                  total: result.consensus.providerCount,
                })}
              </div>
            </div>
            {Object.keys(result.consensus.distribution).length > 1 && (
              <div className="mt-2 pt-2 border-t border-[var(--border)] text-xs">
                <span className="text-[var(--muted)]">{t("distribution")} </span>
                {Object.entries(result.consensus.distribution).map(([rec, count], i, arr) => (
                  <span key={rec}>
                    <strong>{rec}</strong>: {count}
                    {i < arr.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {result.results.map((r) => (
              <div key={r.provider} className="card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">{r.providerLabel}</div>
                    <div className="text-[10px] text-[var(--muted)] font-mono">{r.model}</div>
                  </div>
                  {r.recommendation && (
                    <RecommendationBadge recommendation={r.recommendation} />
                  )}
                </div>
                {r.error ? (
                  <div className="text-xs text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                    {r.error}
                  </div>
                ) : (
                  <>
                    <p className="text-sm">{r.summary}</p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">{r.reasoning}</p>
                    {r.confidence != null && (
                      <div className="text-xs text-[var(--muted)] flex items-center gap-2">
                        <span>{t("confidence", { pct: Math.round(r.confidence * 100) })}</span>
                        <Clock size={10} />
                        <span>{(r.durationMs / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
