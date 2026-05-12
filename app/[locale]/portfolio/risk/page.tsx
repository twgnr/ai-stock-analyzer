"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Shield,
  TrendingDown,
  Activity,
  AlertCircle,
  RefreshCw,
  Layers,
} from "lucide-react";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";

interface FactorScoreSet {
  value: number;
  growth: number;
  size: number;
  quality: number;
  momentum: number;
}

interface FactorAggregate {
  weightedScores: FactorScoreSet;
  tilt: Array<{ factor: keyof FactorScoreSet; label: string; score: number; deviation: number }>;
}

interface FactorPerPosition {
  ticker: string;
  name?: string;
  weight: number;
  scores: FactorScoreSet;
}

interface FactorPayload {
  positions: number;
  totalValue?: number;
  perPosition?: FactorPerPosition[];
  aggregate?: FactorAggregate;
  message?: string;
}

interface VarResult {
  confidence: number;
  varDaily: number;
  varMonthly: number;
  cvarDaily: number;
  cvarMonthly: number;
  parametricVarDaily: number;
  observations: number;
}

interface StressContribution {
  ticker: string;
  weight: number;
  tickerReturn: number;
  contribution: number;
}

interface StressResult {
  scenario: {
    key: string;
    label: string;
    start: string;
    end: string;
    description: string;
  };
  portfolioReturn: number | null;
  contributions: StressContribution[];
  missingTickers: string[];
}

interface MonteCarlo {
  paths: number;
  horizonDays: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  probLossEnd: number;
  probDrawdownGt20: number;
  probGainGt20: number;
  meanEnd: number;
}

interface Payload {
  positions: number;
  totalValue?: number;
  returnsObservations?: number;
  missingHistory?: string[];
  var95?: VarResult | null;
  var99?: VarResult | null;
  stress?: StressResult[];
  monteCarlo?: MonteCarlo | null;
  message?: string;
}

export default function RiskPage() {
  const t = useTranslations("Portfolio");
  const tr = useTranslations("Portfolio.risk");
  const [data, setData] = useState<Payload | null>(null);
  const [factors, setFactors] = useState<FactorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [riskRes, factorRes] = await Promise.all([
        fetch("/api/portfolio/risk"),
        fetch("/api/portfolio/factor-exposure"),
      ]);
      if (riskRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const riskJson = await riskRes.json();
      if (!riskRes.ok) throw new Error(riskJson.error || tr("errorGeneric"));
      setData(riskJson);
      if (factorRes.ok) {
        setFactors(await factorRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Link
        href="/portfolio"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("backToPortfolio")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Shield size={22} className="text-[var(--accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{tr("title")}</h1>
        </div>
        <button onClick={load} disabled={loading} className="btn text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {tr("recalculate")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {tr("description")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {tr("loading")}
        </div>
      )}

      {data?.message && (
        <div className="card p-8 text-center text-[var(--muted)]">{data.message}</div>
      )}

      {data && data.positions > 0 && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <VarCard title={tr("var95")} result={data.var95} />
            <VarCard title={tr("var99")} result={data.var99} />
          </div>

          {data.monteCarlo && (
            <MonteCarloCard mc={data.monteCarlo} totalValue={data.totalValue || 0} />
          )}

          {data.stress && data.stress.length > 0 && (
            <StressCard stress={data.stress} totalValue={data.totalValue || 0} />
          )}

          {data.missingHistory && data.missingHistory.length > 0 && (
            <div className="card p-3 text-xs text-yellow-400">
              {tr("missingHistory", { tickers: data.missingHistory.join(", ") })}
            </div>
          )}

          {factors?.aggregate && (
            <FactorExposureCard payload={factors} />
          )}
        </>
      )}
    </div>
  );
}

function FactorExposureCard({ payload }: { payload: FactorPayload }) {
  const tr = useTranslations("Portfolio.risk");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  if (!payload.aggregate || !payload.perPosition) return null;
  const agg = payload.aggregate;
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Layers size={16} className="text-[var(--accent)]" aria-hidden="true" />
        {tr("factorExposure")}
      </h2>
      <div className="text-xs text-[var(--muted)]">
        {tr("factorDescription")}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {agg.tilt.map((t) => (
          <div
            key={t.factor}
            className={`border rounded p-2 ${
              Math.abs(t.deviation) >= 15
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border)]"
            }`}
          >
            <div className="text-[10px] text-[var(--muted)]">{t.label}</div>
            <div className="text-lg num font-semibold">{t.score}</div>
            <div
              className={`text-[10px] num ${
                t.deviation > 0
                  ? "text-[var(--green)]"
                  : t.deviation < 0
                    ? "text-[var(--red)]"
                    : "text-[var(--muted)]"
              }`}
            >
              {tr("vsNeutral", { value: `${t.deviation > 0 ? "+" : ""}${t.deviation}` })}
            </div>
          </div>
        ))}
      </div>

      <details className="pt-2 border-t border-[var(--border)]">
        <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)]">
          {tr("showPerPosition", { count: payload.perPosition.length })}
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead className="text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-2 py-1">{tr("headerTicker")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerWeight")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerValue")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerGrowth")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerSize")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerQuality")}</th>
                <th className="text-right font-medium px-2 py-1">{tr("headerMomentum")}</th>
              </tr>
            </thead>
            <tbody>
              {payload.perPosition.map((p) => (
                <tr key={p.ticker} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-2 py-1 font-medium">{p.ticker}</td>
                  <td className="px-2 py-1 text-right num text-[var(--muted)]">
                    {fmtNumber(p.weight, numberLocale, 1)}%
                  </td>
                  <td className="px-2 py-1 text-right num">{p.scores.value}</td>
                  <td className="px-2 py-1 text-right num">{p.scores.growth}</td>
                  <td className="px-2 py-1 text-right num">{p.scores.size}</td>
                  <td className="px-2 py-1 text-right num">{p.scores.quality}</td>
                  <td className="px-2 py-1 text-right num">{p.scores.momentum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function VarCard({ title, result }: { title: string; result: VarResult | null | undefined }) {
  const tr = useTranslations("Portfolio.risk");
  return (
    <div className="card p-4 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        <TrendingDown size={16} className="text-[var(--red)]" aria-hidden="true" />
        {title}
      </h2>
      {!result ? (
        <div className="text-xs text-[var(--muted)]">
          {tr("varNotEnough")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-[var(--muted)]">{tr("varDaily")}</div>
              <div className="text-xl num font-semibold text-[var(--red)]">
                −{fmtPercent(result.varDaily * 100)}
              </div>
              <div className="text-[10px] text-[var(--muted)]">
                {tr("varParametric", { value: fmtPercent(result.parametricVarDaily * 100) })}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{tr("varMonthly")}</div>
              <div className="text-xl num font-semibold text-[var(--red)]">
                −{fmtPercent(result.varMonthly * 100)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{tr("cvarDaily")}</div>
              <div className="text-sm num font-medium text-[var(--red)]">
                −{fmtPercent(result.cvarDaily * 100)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{tr("cvarMonthly")}</div>
              <div className="text-sm num font-medium text-[var(--red)]">
                −{fmtPercent(result.cvarMonthly * 100)}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            {tr("varBasis", {
              observations: result.observations,
              confidence: (result.confidence * 100).toFixed(0),
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MonteCarloCard({ mc, totalValue }: { mc: MonteCarlo; totalValue: number }) {
  const tr = useTranslations("Portfolio.risk");
  const years = mc.horizonDays / 252;
  const titleKey = years === 1 ? "mcTitleSingular" : "mcTitlePlural";
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Activity size={16} className="text-[var(--accent)]" aria-hidden="true" />
        {tr(titleKey, { years: years.toFixed(0), paths: mc.paths })}
      </h2>
      <div className="text-xs text-[var(--muted)]">
        {tr("mcDescription")}
      </div>
      <div className="grid grid-cols-5 gap-2 text-sm">
        <PercentileCell label={tr("mcP5")} value={mc.percentiles.p5} totalValue={totalValue} />
        <PercentileCell label={tr("mcP25")} value={mc.percentiles.p25} totalValue={totalValue} />
        <PercentileCell label={tr("mcMedian")} value={mc.percentiles.p50} totalValue={totalValue} highlight />
        <PercentileCell label={tr("mcP75")} value={mc.percentiles.p75} totalValue={totalValue} />
        <PercentileCell label={tr("mcP95")} value={mc.percentiles.p95} totalValue={totalValue} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-sm pt-2 border-t border-[var(--border)]">
        <div>
          <div className="text-xs text-[var(--muted)]">{tr("mcProbLoss")}</div>
          <div className="num font-semibold">{fmtPercent(mc.probLossEnd * 100)}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">{tr("mcProbDrawdown")}</div>
          <div className="num font-semibold text-yellow-400">
            {fmtPercent(mc.probDrawdownGt20 * 100)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">{tr("mcProbGain")}</div>
          <div className="num font-semibold text-[var(--green)]">
            {fmtPercent(mc.probGainGt20 * 100)}
          </div>
        </div>
      </div>
    </div>
  );
}

function PercentileCell({
  label,
  value,
  totalValue,
  highlight,
}: {
  label: string;
  value: number;
  totalValue: number;
  highlight?: boolean;
}) {
  const pct = (value - 1) * 100;
  const end = totalValue * value;
  const tone = value >= 1 ? "text-[var(--green)]" : "text-[var(--red)]";
  return (
    <div
      className={`border rounded p-2 ${
        highlight
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)]"
      }`}
    >
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className={`num font-semibold ${tone}`}>
        {pct > 0 ? "+" : ""}
        {fmtPercent(pct)}
      </div>
      <div className="text-[10px] text-[var(--muted)]">{fmtCurrency(end, "EUR")}</div>
    </div>
  );
}

function StressCard({ stress, totalValue }: { stress: StressResult[]; totalValue: number }) {
  const tr = useTranslations("Portfolio.risk");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">{tr("stressTitle")}</h2>
      <div className="text-xs text-[var(--muted)]">
        {tr("stressDescription")}
      </div>
      <div className="space-y-3">
        {stress.map((s) => {
          if (s.portfolioReturn == null) {
            return (
              <div key={s.scenario.key} className="border border-[var(--border)] rounded p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold">{s.scenario.label}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {s.scenario.start} — {s.scenario.end}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {tr("stressNoHistory")}
                  </div>
                </div>
              </div>
            );
          }
          const pct = s.portfolioReturn * 100;
          const delta = s.portfolioReturn * totalValue;
          const tone = pct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";
          return (
            <div key={s.scenario.key} className="border border-[var(--border)] rounded p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold">{s.scenario.label}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {s.scenario.start} — {s.scenario.end} · {s.scenario.description}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg num font-semibold ${tone}`}>
                    {pct > 0 ? "+" : ""}
                    {fmtPercent(pct)}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{fmtCurrency(delta, "EUR")}</div>
                </div>
              </div>
              {s.contributions.length > 0 && (
                <details>
                  <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)]">
                    {tr("stressTopContrib", { count: s.contributions.length })}
                  </summary>
                  <div className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                    {s.contributions.slice(0, 10).map((c) => (
                      <div
                        key={c.ticker}
                        className="flex justify-between border-b border-[var(--border)] py-1"
                      >
                        <span>
                          {c.ticker}{" "}
                          <span className="text-[var(--muted)]">
                            ({fmtNumber(c.weight / totalValue * 100, numberLocale, 1)}%)
                          </span>
                        </span>
                        <span
                          className={
                            c.tickerReturn >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }
                        >
                          {c.tickerReturn > 0 ? "+" : ""}
                          {fmtPercent(c.tickerReturn * 100)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {s.missingTickers.length > 0 && (
                <div className="text-[10px] text-[var(--muted)]">
                  {tr("stressNotIncluded", { tickers: s.missingTickers.join(", ") })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
