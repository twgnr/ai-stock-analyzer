"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BarChart3, Sparkles, AlertCircle } from "lucide-react";
import { RecommendationBadge } from "@/components/RecommendationBadge";

interface EpsPoint {
  date: string;
  actual?: number;
  estimate?: number;
  surprisePercent?: number;
}

type BeatMissKey = "beat" | "miss" | "mixed" | "inline" | "unknown";

interface EarningsReactionResponse {
  ticker: string;
  name: string;
  headline: string;
  summary: string;
  beatMiss: BeatMissKey;
  guidanceInterpretation: string;
  marketReactionAnalysis: string;
  recommendation: string;
  confidence: number;
  reasoning: string;
  risks: string[];
  opportunities: string[];
  priceChange5d: number;
  priceChange30d: number;
  lastEarningsDate?: string;
  nextEarningsDate?: string;
  epsHistory: EpsPoint[];
}

const BEAT_MISS_CLASS: Record<BeatMissKey, string> = {
  beat: "text-[var(--green)] bg-green-500/10 border-green-500/30",
  miss: "text-[var(--red)] bg-red-500/10 border-red-500/30",
  mixed: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  inline: "text-[var(--muted)] bg-[var(--surface-2)]",
  unknown: "text-[var(--muted)] bg-[var(--surface-2)]",
};

export function EarningsReactionPanel({ ticker }: { ticker: string }) {
  const t = useTranslations("AnalysisPanels.earningsReaction");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [result, setResult] = useState<EarningsReactionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/earnings-reaction", {
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
          <BarChart3 size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
        </div>
        <button onClick={run} disabled={loading} className="btn btn-primary">
          {loading ? <div className="spinner" /> : <Sparkles size={14} />}
          {loading ? t("running") : t("run")}
        </button>
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
          <div className="flex items-center gap-2 flex-wrap">
            <RecommendationBadge recommendation={result.recommendation} />
            <span
              className={`text-xs px-2 py-0.5 rounded border ${
                BEAT_MISS_CLASS[result.beatMiss]
              }`}
            >
              {t(`beatMiss.${result.beatMiss}` as Parameters<typeof t>[0])}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {t("confidence", { pct: Math.round(result.confidence * 100) })}
            </span>
          </div>

          <div>
            <div className="font-semibold">{result.headline}</div>
            <p className="text-sm mt-1">{result.summary}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label={t("priceChange5d")} value={fmtPct(result.priceChange5d)} />
            <Stat label={t("priceChange30d")} value={fmtPct(result.priceChange30d)} />
            {result.lastEarningsDate && (
              <Stat
                label={t("lastReport")}
                value={new Date(result.lastEarningsDate).toLocaleDateString(dateLocale)}
              />
            )}
            {result.nextEarningsDate && (
              <Stat
                label={t("nextReport")}
                value={new Date(result.nextEarningsDate).toLocaleDateString(dateLocale)}
              />
            )}
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("guidance")}
            </div>
            <p className="text-sm">{result.guidanceInterpretation}</p>
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("marketReaction")}
            </div>
            <p className="text-sm">{result.marketReactionAnalysis}</p>
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("reasoning")}
            </div>
            <p className="text-sm leading-relaxed">{result.reasoning}</p>
          </div>

          {result.epsHistory.length > 0 && (
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("epsHistory")}
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-2 py-2">{t("columns.quarter")}</th>
                      <th className="text-right font-medium px-2 py-2">{t("columns.actual")}</th>
                      <th className="text-right font-medium px-2 py-2">{t("columns.estimate")}</th>
                      <th className="text-right font-medium px-2 py-2">{t("columns.surprise")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.epsHistory.map((q, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-2 py-2">{q.date}</td>
                        <td className="px-2 py-2 text-right num">{q.actual ?? "—"}</td>
                        <td className="px-2 py-2 text-right num text-[var(--muted)]">
                          {q.estimate ?? "—"}
                        </td>
                        <td
                          className={`px-2 py-2 text-right num ${
                            q.surprisePercent == null
                              ? "text-[var(--muted)]"
                              : q.surprisePercent >= 0
                              ? "text-[var(--green)]"
                              : "text-[var(--red)]"
                          }`}
                        >
                          {q.surprisePercent != null
                            ? `${q.surprisePercent >= 0 ? "+" : ""}${q.surprisePercent.toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {result.opportunities.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t("opportunities")}
                </div>
                <ul className="text-sm space-y-1">
                  {result.opportunities.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--green)]">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.risks.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t("risks")}
                </div>
                <ul className="text-sm space-y-1">
                  {result.risks.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--red)]">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtPct(n: number): string {
  const colored = n >= 0 ? "+" : "";
  return `${colored}${n.toFixed(2)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] rounded-md p-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="num font-medium">{value}</div>
    </div>
  );
}
