"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Calculator, AlertCircle, Lightbulb, AlertTriangle } from "lucide-react";
import { fmtCurrency, fmtNumber } from "@/lib/format";

interface Props {
  ticker: string;
  currency: string;
}

type RiskProfile = "conservative" | "moderate" | "aggressive";

const RISK_PROFILES: RiskProfile[] = ["conservative", "moderate", "aggressive"];

interface SizingResult {
  suggestedAmountBase: number;
  suggestedShares: number;
  suggestedWeightPercent: number;
  maxWeightPercent: number;
  confidence: number;
  reasoning: string;
  warnings: string[];
  alternatives: string[];
  baseCurrency: string;
  currentPortfolioValue: number;
  existingWeight: number;
  riskProfile: string;
}

export function PositionSizingPanel({ ticker }: Props) {
  const t = useTranslations("AnalysisPanels.positionSizing");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("moderate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SizingResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/sizing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, riskProfile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorFallback"));
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
          <Calculator size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
        </div>
        <div className="flex gap-1">
          {RISK_PROFILES.map((p) => (
            <button
              key={p}
              onClick={() => setRiskProfile(p)}
              className={`px-3 py-1 text-xs rounded ${
                riskProfile === p
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {t(`profiles.${p}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        {t("intro", { ticker })}
      </p>

      <button onClick={run} disabled={loading} className="btn btn-primary">
        {loading ? <div className="spinner" /> : <Calculator size={14} />}
        {loading ? t("computing") : t("compute")}
      </button>

      {error && (
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4 pt-2 border-t border-[var(--border)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">{t("recommendation")}</div>
              <div className="text-xl font-semibold num text-[var(--accent)]">
                {fmtCurrency(result.suggestedAmountBase, result.baseCurrency, numLocale)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">{t("shares")}</div>
              <div className="text-xl font-semibold num">{result.suggestedShares}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">{t("suggestedWeight")}</div>
              <div className="text-xl font-semibold num">
                {fmtNumber(result.suggestedWeightPercent, numLocale, 1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">{t("maxWeight")}</div>
              <div className="text-xl font-semibold num text-[var(--muted)]">
                {fmtNumber(result.maxWeightPercent, numLocale, 1)}%
              </div>
            </div>
          </div>

          <div className="text-xs text-[var(--muted)]">
            {t("basis", { value: fmtCurrency(result.currentPortfolioValue, result.baseCurrency, numLocale) })}
            {result.existingWeight > 0 && (
              <>{t("existingHolding", { pct: fmtNumber(result.existingWeight, numLocale, 1), ticker })}</>
            )}
            {t("riskProfile", { profile: result.riskProfile })}
            {t("confidence", { pct: Math.round(result.confidence * 100) })}
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("reasoning")}
            </div>
            <p className="text-sm leading-relaxed">{result.reasoning}</p>
          </div>

          {result.warnings?.length > 0 && (
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {t("warnings")}
              </div>
              <ul className="text-sm space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-yellow-400">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.alternatives?.length > 0 && (
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Lightbulb size={12} /> {t("alternatives")}
              </div>
              <ul className="text-sm space-y-1">
                {result.alternatives.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--accent)]">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
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
