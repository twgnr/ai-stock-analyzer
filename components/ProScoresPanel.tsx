"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Award,
  ShieldAlert,
  AlertTriangle,
  Calculator,
  Banknote,
  CheckCircle2,
  XCircle,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fmtNumber, fmtPercent, fmtCurrency } from "@/lib/format";

interface PiotroskiCriterion {
  key: string;
  label: string;
  passed: boolean | null;
  value?: string;
}
interface ScoresPayload {
  ticker: string;
  currency: string;
  piotroski: {
    score: number;
    maxScore: number;
    criteria: PiotroskiCriterion[];
    label: string;
    applicable: boolean;
  };
  altman: {
    z: number | null;
    zone: string;
    interpretation: string;
    components: Record<string, number | null>;
  };
  beneish: {
    m: number | null;
    label: string;
    interpretation: string;
    components: Record<string, number | null>;
  };
  graham: {
    grahamNumber: number | null;
    currentPrice: number | null;
    upsideDownsidePct: number | null;
    interpretation: string;
  };
  shareholderYield: {
    dividendYieldPct: number | null;
    buybackYieldPct: number | null;
    debtPaydownYieldPct: number | null;
    totalShareholderYieldPct: number | null;
    interpretation: string;
  };
  shortInterest: {
    sharesShort?: number;
    shortPercentOfFloat?: number;
    shortRatio?: number;
    dateShortInterest?: string;
    shortPercentChange?: number;
  } | null;
  epsRevisions: Array<{
    period: string;
    label: string;
    currentEstimate?: number;
    estimateCount?: number;
    up7d?: number;
    down7d?: number;
    up30d?: number;
    down30d?: number;
    growth?: number;
  }>;
  dividendGrowth: {
    cagr3y: number | null;
    cagr5y: number | null;
    cagr10y: number | null;
    streakYears: number;
    annualHistory: Array<{ year: number; total: number }>;
    currency: string;
  } | null;
}

interface Props {
  ticker: string;
}

type AltmanZone = "safe" | "grey" | "distress";

export function ProScoresPanel({ ticker }: Props) {
  const t = useTranslations("AnalysisPanels.proScores");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<ScoresPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze/scores/${encodeURIComponent(ticker)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, tCommon]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="card p-4 text-sm text-[var(--muted)] flex items-center gap-2">
        <div className="spinner" /> {t("loading")}
      </div>
    );
  }
  if (error || !data) {
    return null;
  }

  function toggle(k: string) {
    setExpanded((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Award size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
        <span className="text-xs text-[var(--muted)]">
          {t("subtitle")}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Piotroski */}
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggle("piotroski")}
          >
            <div className="flex items-center gap-2">
              <Award size={14} className="text-[var(--accent)]" />
              <span className="font-semibold text-sm">{t("piotroski.title")}</span>
            </div>
            {expanded.piotroski ? (
              <ChevronUp size={14} className="text-[var(--muted)]" />
            ) : (
              <ChevronDown size={14} className="text-[var(--muted)]" />
            )}
          </div>
          {data.piotroski.applicable ? (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold num ${
                    data.piotroski.score >= 7
                      ? "text-[var(--green)]"
                      : data.piotroski.score >= 4
                        ? ""
                        : "text-[var(--red)]"
                  }`}
                >
                  {data.piotroski.score}
                </span>
                <span className="text-sm text-[var(--muted)]">
                  {t("piotroski.outOf", { max: data.piotroski.maxScore, label: data.piotroski.label })}
                </span>
              </div>
              {expanded.piotroski && (
                <ul className="space-y-1 text-xs pt-2 border-t border-[var(--border)]">
                  {data.piotroski.criteria.map((c) => (
                    <li key={c.key} className="flex items-start gap-2">
                      {c.passed === true ? (
                        <CheckCircle2
                          size={12}
                          className="text-[var(--green)] flex-shrink-0 mt-0.5"
                        />
                      ) : c.passed === false ? (
                        <XCircle
                          size={12}
                          className="text-[var(--red)] flex-shrink-0 mt-0.5"
                        />
                      ) : (
                        <MinusCircle
                          size={12}
                          className="text-[var(--muted)] flex-shrink-0 mt-0.5"
                        />
                      )}
                      <span className="flex-1">{c.label}</span>
                      {c.value && (
                        <span className="text-[var(--muted)] num">{c.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">
              {t("piotroski.missing")}
            </div>
          )}
        </div>

        {/* Altman */}
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-[var(--accent)]" />
            <span className="font-semibold text-sm">{t("altman.title")}</span>
          </div>
          {data.altman.z != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold num ${
                    data.altman.zone === "safe"
                      ? "text-[var(--green)]"
                      : data.altman.zone === "grey"
                        ? "text-yellow-400"
                        : "text-[var(--red)]"
                  }`}
                >
                  {fmtNumber(data.altman.z, numLocale, 2)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {t(`altman.zones.${data.altman.zone as AltmanZone}` as Parameters<typeof t>[0])}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {data.altman.interpretation}
              </div>
              <div className="text-[10px] text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                <span>
                  WC/TA{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.altman.components.workingCapitalToAssets != null
                      ? fmtNumber(
                          data.altman.components.workingCapitalToAssets,
                          numLocale,
                          2
                        )
                      : "—"}
                  </span>
                </span>
                <span>
                  EBIT/TA{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.altman.components.ebitToAssets != null
                      ? fmtNumber(data.altman.components.ebitToAssets, numLocale, 2)
                      : "—"}
                  </span>
                </span>
                <span>
                  MV/TL{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.altman.components.marketEquityToLiabilities != null
                      ? fmtNumber(
                          data.altman.components.marketEquityToLiabilities,
                          numLocale,
                          2
                        )
                      : "—"}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">
              {data.altman.interpretation}
            </div>
          )}
        </div>

        {/* Beneish */}
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-yellow-400" />
            <span className="font-semibold text-sm">{t("beneish.title")}</span>
          </div>
          {data.beneish.m != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold num ${
                    data.beneish.label === "likely manipulator"
                      ? "text-[var(--red)]"
                      : "text-[var(--green)]"
                  }`}
                >
                  {fmtNumber(data.beneish.m, numLocale, 2)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {t("beneish.threshold")}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {data.beneish.interpretation}
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">
              {data.beneish.interpretation}
            </div>
          )}
        </div>

        {/* Graham */}
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Calculator size={14} className="text-[var(--accent)]" />
            <span className="font-semibold text-sm">{t("graham.title")}</span>
          </div>
          {data.graham.grahamNumber != null ? (
            <>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-xl font-bold num">
                  {fmtCurrency(data.graham.grahamNumber, data.currency, numLocale)}
                </span>
                {data.graham.upsideDownsidePct != null && (
                  <span
                    className={`text-sm num ${
                      data.graham.upsideDownsidePct > 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }`}
                  >
                    {data.graham.upsideDownsidePct > 0 ? "+" : ""}
                    {fmtPercent(data.graham.upsideDownsidePct, numLocale)}
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {data.graham.interpretation}
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">
              {data.graham.interpretation}
            </div>
          )}
        </div>

        {/* Shareholder Yield */}
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Banknote size={14} className="text-[var(--accent)]" />
            <span className="font-semibold text-sm">{t("shareholderYield.title")}</span>
          </div>
          {data.shareholderYield.totalShareholderYieldPct != null ? (
            <>
              <div className="text-xl font-bold num">
                {fmtPercent(data.shareholderYield.totalShareholderYieldPct, numLocale)}
              </div>
              <div className="text-[10px] text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                <span>
                  {t("shareholderYield.div")}{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.shareholderYield.dividendYieldPct != null
                      ? fmtPercent(data.shareholderYield.dividendYieldPct, numLocale)
                      : "—"}
                  </span>
                </span>
                <span>
                  {t("shareholderYield.buyback")}{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.shareholderYield.buybackYieldPct != null
                      ? fmtPercent(data.shareholderYield.buybackYieldPct, numLocale)
                      : "—"}
                  </span>
                </span>
                <span>
                  {t("shareholderYield.debtPaydown")}{" "}
                  <span className="num text-[var(--foreground)]">
                    {data.shareholderYield.debtPaydownYieldPct != null
                      ? fmtPercent(data.shareholderYield.debtPaydownYieldPct, numLocale)
                      : "—"}
                  </span>
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {data.shareholderYield.interpretation}
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">
              {data.shareholderYield.interpretation}
            </div>
          )}
        </div>

        {/* Dividend Growth */}
        {data.dividendGrowth && (
          <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--green)]" />
              <span className="font-semibold text-sm">{t("dividendGrowth.title")}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <DivCagr label={t("dividendGrowth.cagr3y")} value={data.dividendGrowth.cagr3y} numLocale={numLocale} />
              <DivCagr label={t("dividendGrowth.cagr5y")} value={data.dividendGrowth.cagr5y} numLocale={numLocale} />
              <DivCagr label={t("dividendGrowth.cagr10y")} value={data.dividendGrowth.cagr10y} numLocale={numLocale} />
            </div>
            <div className="text-xs text-[var(--muted)]">
              <strong className="text-[var(--foreground)] num">
                {data.dividendGrowth.streakYears}
              </strong>{" "}
              {data.dividendGrowth.streakYears === 1
                ? t("dividendGrowth.streakSuffixOne")
                : t("dividendGrowth.streakSuffixOther")}
            </div>
          </div>
        )}

        {/* Short Interest */}
        {data.shortInterest && (
          <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingDown size={14} className="text-[var(--red)]" />
              <span className="font-semibold text-sm">{t("shortInterest.title")}</span>
              {data.shortInterest.dateShortInterest && (
                <span className="text-[10px] text-[var(--muted)]">
                  {t("shortInterest.asOf", { date: new Date(data.shortInterest.dateShortInterest).toLocaleDateString(numLocale) })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {data.shortInterest.shortPercentOfFloat != null && (
                <div>
                  <div className="text-[var(--muted)]">{t("shortInterest.pctFloat")}</div>
                  <div className="text-lg font-bold num">
                    {fmtPercent(data.shortInterest.shortPercentOfFloat * 100, numLocale)}
                  </div>
                </div>
              )}
              {data.shortInterest.shortRatio != null && (
                <div>
                  <div className="text-[var(--muted)]">{t("shortInterest.daysToCover")}</div>
                  <div className="text-lg font-bold num">
                    {fmtNumber(data.shortInterest.shortRatio, numLocale, 1)}
                  </div>
                </div>
              )}
            </div>
            {data.shortInterest.shortPercentChange != null && (
              <div
                className={`text-xs num ${
                  data.shortInterest.shortPercentChange > 0
                    ? "text-[var(--red)]"
                    : "text-[var(--green)]"
                }`}
              >
                {t("shortInterest.mom")}{" "}
                {data.shortInterest.shortPercentChange > 0 ? "+" : ""}
                {fmtPercent(data.shortInterest.shortPercentChange, numLocale)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EPS Revisions */}
      {data.epsRevisions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{t("epsRevisions.title")}</h3>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">{t("epsRevisions.columns.period")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("epsRevisions.columns.avgEstimate")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("epsRevisions.columns.analysts")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("epsRevisions.columns.rev7d")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("epsRevisions.columns.rev30d")}</th>
                </tr>
              </thead>
              <tbody>
                {data.epsRevisions.map((r) => {
                  const net30 = (r.up30d || 0) - (r.down30d || 0);
                  return (
                    <tr
                      key={r.period}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2 text-right num">
                        {r.currentEstimate != null
                          ? fmtNumber(r.currentEstimate, numLocale, 2)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right num text-xs text-[var(--muted)]">
                        {r.estimateCount ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        <span className="text-[var(--green)]">↑{r.up7d ?? 0}</span>{" "}
                        /{" "}
                        <span className="text-[var(--red)]">↓{r.down7d ?? 0}</span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right text-xs font-medium ${
                          net30 > 0
                            ? "text-[var(--green)]"
                            : net30 < 0
                              ? "text-[var(--red)]"
                              : "text-[var(--muted)]"
                        }`}
                      >
                        <span className="text-[var(--green)]">↑{r.up30d ?? 0}</span>{" "}
                        /{" "}
                        <span className="text-[var(--red)]">↓{r.down30d ?? 0}</span>{" "}
                        {net30 !== 0 && `(${net30 > 0 ? "+" : ""}${net30})`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)] flex items-start gap-1">
        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          {t("disclaimer")}
        </span>
      </div>
    </div>
  );
}

function DivCagr({ label, value, numLocale }: { label: string; value: number | null; numLocale: string }) {
  return (
    <div>
      <div className="text-[var(--muted)]">{label}</div>
      <div
        className={`font-bold num ${
          value == null
            ? "text-[var(--muted)]"
            : value > 0
              ? "text-[var(--green)]"
              : "text-[var(--red)]"
        }`}
      >
        {value != null ? `${value > 0 ? "+" : ""}${fmtPercent(value, numLocale)}` : "—"}
      </div>
    </div>
  );
}
