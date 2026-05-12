"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  AlertCircle,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtCurrency, fmtPercent } from "@/lib/format";

type Tab = "gaps" | "delta";

interface GapSuggestion {
  ticker: string;
  name: string;
  rationale: string;
  allocationPercent: string;
}

interface Gap {
  category: string;
  label: string;
  severity: "critical" | "notable" | "minor";
  reasoning: string;
  suggestions: GapSuggestion[];
}

interface GapsResult {
  overview: string;
  diversificationScore: number;
  gaps: Gap[];
  totalValueBase: number;
  baseCurrency: string;
}

interface DeltaResult {
  headline: string;
  overview: string;
  narrative: string;
  concerns: string[];
  opportunities: string[];
  actionItems: string[];
  metadata: {
    days: number;
    currentValueBase: number;
    previousValueBase: number;
    valueDelta: number;
    valueDeltaPct: number;
    realizedGainsBase: number;
    transactionCount: number;
    hasSnapshot: boolean;
    baseCurrency: string;
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-[var(--red)] bg-red-500/10 border-red-500/30",
  notable: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  minor: "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--border)]",
};

export default function InsightsPage() {
  const t = useTranslations("Insights.page");
  const tCommon = useTranslations("Insights.common");
  const [tab, setTab] = useState<Tab>("gaps");

  const [gaps, setGaps] = useState<GapsResult | null>(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);

  const [deltaDays, setDeltaDays] = useState(30);
  const [delta, setDelta] = useState<DeltaResult | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError, setDeltaError] = useState<string | null>(null);

  async function runGaps() {
    setGapsLoading(true);
    setGapsError(null);
    try {
      const res = await fetch("/api/analyze/portfolio-gaps", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGaps(data);
    } catch (e) {
      setGapsError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setGapsLoading(false);
    }
  }

  async function runDelta() {
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const res = await fetch("/api/analyze/portfolio-delta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: deltaDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDelta(data);
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setDeltaLoading(false);
    }
  }

  const severityLabel = (sev: string) => {
    if (sev === "critical" || sev === "notable" || sev === "minor") {
      return t(`gaps.severity.${sev}` as "gaps.severity.critical" | "gaps.severity.notable" | "gaps.severity.minor");
    }
    return sev;
  };

  const periodLabel = (d: number) => {
    if (d === 7) return t("delta.period7d");
    if (d === 30) return t("delta.period30d");
    if (d === 90) return t("delta.period3m");
    return t("delta.period6m");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Compass size={22} className="text-[var(--accent)]" />
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)]">{t("description")}</p>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        <button
          onClick={() => setTab("gaps")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "gaps"
              ? "border-[var(--accent)] text-white"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <Target size={14} className="inline mr-1" /> {t("tabs.gaps")}
        </button>
        <button
          onClick={() => setTab("delta")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "delta"
              ? "border-[var(--accent)] text-white"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <TrendingUp size={14} className="inline mr-1" /> {t("tabs.delta")}
        </button>
      </div>

      {tab === "gaps" && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <p className="text-sm">
              {t.rich("gaps.intro", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <button onClick={runGaps} disabled={gapsLoading} className="btn btn-primary">
              {gapsLoading ? <div className="spinner" /> : <Sparkles size={14} />}
              {gapsLoading ? t("gaps.analyzing") : t("gaps.start")}
            </button>
          </div>

          {gapsError && (
            <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
              <AlertCircle size={14} /> {gapsError}
            </div>
          )}

          {gaps && (
            <>
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-semibold">{t("gaps.overall")}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">{t("gaps.diversificationScore")}</span>
                    <span
                      className={`text-2xl font-bold num ${
                        gaps.diversificationScore >= 70
                          ? "text-[var(--green)]"
                          : gaps.diversificationScore >= 50
                          ? "text-yellow-400"
                          : "text-[var(--red)]"
                      }`}
                    >
                      {gaps.diversificationScore}
                    </span>
                    <span className="text-xs text-[var(--muted)]">/100</span>
                  </div>
                </div>
                <p className="text-sm">{gaps.overview}</p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  {t("gaps.identifiedGaps", { count: gaps.gaps.length })}
                </h2>
                <div className="space-y-3">
                  {gaps.gaps.map((gap, i) => (
                    <div key={i} className="card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-semibold">{gap.label}</div>
                          <div className="text-xs text-[var(--muted)] capitalize">
                            {gap.category}
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            SEVERITY_COLORS[gap.severity] || SEVERITY_COLORS.minor
                          }`}
                        >
                          {severityLabel(gap.severity)}
                        </span>
                      </div>
                      <p className="text-sm">{gap.reasoning}</p>
                      {gap.suggestions.length > 0 && (
                        <div className="pt-2 border-t border-[var(--border)] space-y-2">
                          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
                            {t("gaps.concreteSuggestions")}
                          </div>
                          {gap.suggestions.map((s, j) => (
                            <div
                              key={j}
                              className="flex items-start justify-between gap-3 bg-[var(--surface-2)] rounded p-2"
                            >
                              <div className="flex-1 min-w-0">
                                <Link
                                  href={`/analysis/${encodeURIComponent(s.ticker)}`}
                                  className="font-semibold hover:text-[var(--accent)]"
                                >
                                  {s.ticker}
                                </Link>
                                <span className="text-xs text-[var(--muted)] ml-2">{s.name}</span>
                                <div className="text-xs mt-1">{s.rationale}</div>
                              </div>
                              <span className="text-xs text-[var(--accent)] bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded whitespace-nowrap">
                                {s.allocationPercent}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "delta" && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <p className="text-sm">
              {t.rich("delta.intro", {
                days: deltaDays,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-[var(--muted)]">{t("delta.periodLabel")}</label>
              {[7, 30, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setDeltaDays(d)}
                  className={`px-3 py-1 text-xs rounded border ${
                    deltaDays === d
                      ? "border-[var(--accent)] bg-blue-500/10"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {periodLabel(d)}
                </button>
              ))}
            </div>
            <button onClick={runDelta} disabled={deltaLoading} className="btn btn-primary">
              {deltaLoading ? <div className="spinner" /> : <Sparkles size={14} />}
              {deltaLoading ? t("delta.analyzing") : t("delta.start")}
            </button>
          </div>

          {deltaError && (
            <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
              <AlertCircle size={14} /> {deltaError}
            </div>
          )}

          {delta && (
            <>
              <div className="card p-5 space-y-4">
                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t("delta.headline")}
                  </div>
                  <p className="text-lg font-semibold">{delta.headline}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat
                    label={t("delta.stats.valueChange")}
                    value={`${delta.metadata.valueDelta >= 0 ? "+" : ""}${fmtCurrency(
                      delta.metadata.valueDelta,
                      delta.metadata.baseCurrency
                    )}`}
                    subValue={fmtPercent(delta.metadata.valueDeltaPct)}
                    color={delta.metadata.valueDelta >= 0 ? "green" : "red"}
                  />
                  <Stat
                    label={t("delta.stats.current")}
                    value={fmtCurrency(
                      delta.metadata.currentValueBase,
                      delta.metadata.baseCurrency
                    )}
                  />
                  <Stat
                    label={t("delta.stats.realizedPnL")}
                    value={fmtCurrency(
                      delta.metadata.realizedGainsBase,
                      delta.metadata.baseCurrency
                    )}
                    color={delta.metadata.realizedGainsBase >= 0 ? "green" : "red"}
                  />
                  <Stat
                    label={t("delta.stats.transactions")}
                    value={String(delta.metadata.transactionCount)}
                  />
                </div>

                {!delta.metadata.hasSnapshot && (
                  <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
                    {t("delta.snapshotMissing")}
                  </div>
                )}

                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t("delta.overview")}
                  </div>
                  <p className="text-sm">{delta.overview}</p>
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t("delta.narrative")}
                  </div>
                  <p className="text-sm leading-relaxed">{delta.narrative}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {delta.concerns.length > 0 && (
                  <div className="card p-4 space-y-2">
                    <h3 className="font-semibold text-[var(--red)] flex items-center gap-2">
                      <ArrowDownRight size={14} /> {t("delta.concerns")}
                    </h3>
                    <ul className="text-sm space-y-1">
                      {delta.concerns.map((c, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--red)]">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {delta.opportunities.length > 0 && (
                  <div className="card p-4 space-y-2">
                    <h3 className="font-semibold text-[var(--green)] flex items-center gap-2">
                      <ArrowUpRight size={14} /> {t("delta.opportunities")}
                    </h3>
                    <ul className="text-sm space-y-1">
                      {delta.opportunities.map((c, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--green)]">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {delta.actionItems.length > 0 && (
                <div className="card p-4 space-y-2 border-[var(--accent)]/30">
                  <h3 className="font-semibold text-[var(--accent)] flex items-center gap-2">
                    <Target size={14} /> {t("delta.actions")}
                  </h3>
                  <ol className="text-sm space-y-1 list-decimal list-inside">
                    {delta.actionItems.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color?: "green" | "red";
}) {
  const colorClass =
    color === "green" ? "text-[var(--green)]" : color === "red" ? "text-[var(--red)]" : "";
  return (
    <div className="border border-[var(--border)] rounded-md p-3">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`font-semibold num ${colorClass}`}>{value}</div>
      {subValue && <div className={`text-xs num ${colorClass}`}>{subValue}</div>}
    </div>
  );
}
