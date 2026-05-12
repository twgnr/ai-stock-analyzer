"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Globe2,
  Sparkles,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Shield,
  Zap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EstimatedCostBadge } from "@/components/EstimatedCostBadge";
import { fmtPercent, changeClass } from "@/lib/format";
import type { AIProvider } from "@/lib/ai/types";

interface PositionImpact {
  ticker: string;
  expectedImpactPct: number;
  severity: "low" | "medium" | "high";
  direction: "up" | "down" | "neutral";
  reasoning: string;
}

interface ScenarioResult {
  scenarioSummary: string;
  portfolioImpactPct: number;
  riskAssessment: "LOW" | "MEDIUM" | "HIGH";
  keyDrivers: string[];
  mostExposed: string[];
  mostInsulated: string[];
  positions: PositionImpact[];
  hedges: string[];
  totalValueBase: number;
  baseCurrency: string;
  positionCount: number;
}

interface ProviderConfig {
  provider: AIProvider;
  model: string;
}

export default function MacroScenarioPage() {
  const t = useTranslations("Macro.scenario");
  const tPresets = useTranslations("Macro.scenario.presets");
  const tResult = useTranslations("Macro.scenario.result");

  const PRESETS: { key: "ecb100bp" | "fedPivot" | "brent120" | "chinaTech" | "usdEur" | "aiBubble"; label: string; scenario: string }[] = [
    { key: "ecb100bp", label: tPresets("ecb100bp.label"), scenario: tPresets("ecb100bp.scenario") },
    { key: "fedPivot", label: tPresets("fedPivot.label"), scenario: tPresets("fedPivot.scenario") },
    { key: "brent120", label: tPresets("brent120.label"), scenario: tPresets("brent120.scenario") },
    { key: "chinaTech", label: tPresets("chinaTech.label"), scenario: tPresets("chinaTech.scenario") },
    { key: "usdEur", label: tPresets("usdEur.label"), scenario: tPresets("usdEur.scenario") },
    { key: "aiBubble", label: tPresets("aiBubble.label"), scenario: tPresets("aiBubble.scenario") },
  ];

  const [scenario, setScenario] = useState("");
  const [result, setResult] = useState<ScenarioResult | null>(null);
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
    if (!scenario.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze/macro-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  const sortedPositions = result
    ? [...result.positions].sort((a, b) => a.expectedImpactPct - b.expectedImpactPct)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Globe2 size={22} className="text-[var(--accent)]" />
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">{t("subtitle")}</p>
      </div>

      <div className="card p-4 space-y-3">
        <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
          {t("scenarioLabel")}
        </label>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          rows={4}
          className="input"
          placeholder={t("placeholder")}
          maxLength={1000}
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setScenario(p.scenario)}
              className="text-xs px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--muted)]">
            {t("charCount", { count: scenario.length })}
          </span>
          <div className="flex items-center gap-2">
            {providers.length > 0 && (
              <EstimatedCostBadge
                providers={providers.slice(0, 1)}
                promptText={scenario + "x".repeat(8000)}
                expectedOutputTokens={3000}
                hint={t("costHint")}
              />
            )}
            <button
              type="button"
              onClick={run}
              disabled={loading || !scenario.trim()}
              className="btn btn-primary"
            >
              {loading ? <div className="spinner" /> : <Sparkles size={14} />}
              {loading ? t("calculating") : t("run")}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-3 text-[var(--red)] flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {result && (
        <>
          <div
            className={`card p-4 border ${
              result.riskAssessment === "HIGH"
                ? "border-[var(--red)]/40 bg-red-500/5"
                : result.riskAssessment === "MEDIUM"
                ? "border-yellow-500/30 bg-yellow-500/5"
                : "border-[var(--green)]/30 bg-green-500/5"
            }`}
          >
            <div className="flex items-start gap-3 flex-wrap">
              {result.riskAssessment === "HIGH" ? (
                <ShieldAlert size={28} className="text-[var(--red)] flex-shrink-0" />
              ) : result.riskAssessment === "MEDIUM" ? (
                <Zap size={28} className="text-yellow-400 flex-shrink-0" />
              ) : (
                <Shield size={28} className="text-[var(--green)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--muted)] mb-1">
                  {tResult("riskAssessment")}: <strong>{result.riskAssessment}</strong>
                </div>
                <div
                  className={`text-3xl font-semibold num ${changeClass(
                    result.portfolioImpactPct
                  )}`}
                >
                  {fmtPercent(result.portfolioImpactPct)}
                </div>
                <div className="text-xs text-[var(--muted)] num">
                  {tResult("portfolioEffect")}
                </div>
                <p className="text-sm mt-2">{result.scenarioSummary}</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <ListCard
              title={tResult("keyDrivers")}
              items={result.keyDrivers}
              icon={<Zap size={14} className="text-[var(--accent)]" />}
            />
            <ListCard
              title={tResult("mostExposed")}
              items={result.mostExposed}
              icon={<TrendingDown size={14} className="text-[var(--red)]" />}
              tickers
            />
            <ListCard
              title={tResult("mostInsulated")}
              items={result.mostInsulated}
              icon={<TrendingUp size={14} className="text-[var(--green)]" />}
              tickers
            />
          </div>

          {result.hedges.length > 0 && (
            <div className="card p-4 space-y-2">
              <h2 className="font-semibold flex items-center gap-2">
                <Shield size={16} className="text-[var(--accent)]" />
                {tResult("hedges")}
              </h2>
              <ul className="text-sm space-y-1">
                {result.hedges.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--muted)]">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              {tResult("positionByPosition")}
            </h2>
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">{tResult("thTicker")}</th>
                    <th className="text-right font-medium px-3 py-2">{tResult("thExpected")}</th>
                    <th className="text-right font-medium px-3 py-2">{tResult("thSeverity")}</th>
                    <th className="text-left font-medium px-3 py-2">{tResult("thReasoning")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p) => (
                    <tr
                      key={p.ticker}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/analysis/${encodeURIComponent(p.ticker)}`}
                          className="font-semibold hover:underline"
                        >
                          {p.ticker}
                        </Link>
                      </td>
                      <td
                        className={`px-3 py-2 text-right num font-medium ${changeClass(
                          p.expectedImpactPct
                        )}`}
                      >
                        {fmtPercent(p.expectedImpactPct)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <SeverityBadge sev={p.severity} />
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--muted)] max-w-md">
                        {p.reasoning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ListCard({
  title,
  items,
  icon,
  tickers,
}: {
  title: string;
  items: string[];
  icon?: React.ReactNode;
  tickers?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="card p-3 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <p className="text-xs text-[var(--muted)]">—</p>
      </div>
    );
  }
  return (
    <div className="card p-3 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        {icon} {title}
      </h3>
      <ul className="text-sm space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[var(--muted)]">•</span>
            {tickers ? (
              <Link
                href={`/analysis/${encodeURIComponent(it)}`}
                className="font-medium hover:underline"
              >
                {it}
              </Link>
            ) : (
              <span>{it}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityBadge({ sev }: { sev: "low" | "medium" | "high" }) {
  const cls =
    sev === "high"
      ? "bg-red-500/15 text-[var(--red)] border-red-500/30"
      : sev === "medium"
      ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
      : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${cls}`}>
      {sev}
    </span>
  );
}
