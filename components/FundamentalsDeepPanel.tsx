"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { fmtNumber, fmtPercent, fmtCurrency } from "@/lib/format";

interface EarningsPoint {
  date: string;
  actual?: number;
  estimate?: number;
  surprisePercent?: number;
}

interface EarningsInfo {
  lastEarningsDate?: string;
  nextEarningsDate?: string;
  quarterlyEPS: EarningsPoint[];
  quarterlyRevenue: EarningsPoint[];
}

interface RatingChange {
  date: string;
  firm: string;
  toGrade?: string;
  fromGrade?: string;
  action?: string;
}

interface Holder {
  organization: string;
  pctHeld?: number;
  position?: number;
  value?: number;
  reportDate?: string;
}

interface Ownership {
  institutionalHolders: Holder[];
  fundHolders: Holder[];
  institutionalPercentHeld?: number;
  insiderPercentHeld?: number;
}

interface FinancialRow {
  endDate: string;
  totalRevenue?: number;
  netIncome?: number;
  operatingIncome?: number;
  operatingCashflow?: number;
  capitalExpenditures?: number;
  totalAssets?: number;
  totalLiab?: number;
  longTermDebt?: number;
}

interface Payload {
  ticker: string;
  earnings: EarningsInfo | null;
  ratings: RatingChange[];
  ownership: Ownership | null;
  financials: { annual: FinancialRow[]; currency: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  up: "text-[var(--green)]",
  main: "text-[var(--muted)]",
  down: "text-[var(--red)]",
  init: "text-[var(--accent)]",
  reit: "text-[var(--muted)]",
};

type ActionKey = "up" | "main" | "down" | "init" | "reit";

export function FundamentalsDeepPanel({ ticker, currency }: { ticker: string; currency: string }) {
  const t = useTranslations("AnalysisPanels.fundamentals");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"earnings" | "ratings" | "owners" | "financials">(
    "earnings"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze/fundamentals-deep?ticker=${encodeURIComponent(ticker)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tCommon("error"));
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

  const surprises = (data?.earnings?.quarterlyEPS || [])
    .filter((p) => p.surprisePercent != null)
    .slice(-8)
    .reverse();
  const beats = surprises.filter((p) => (p.surprisePercent ?? 0) > 0).length;
  const beatRate = surprises.length > 0 ? (beats / surprises.length) * 100 : null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 size={16} className="text-[var(--accent)]" aria-hidden="true" />
          {t("title")}
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="btn text-xs"
          aria-label={t("reloadAria")}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {t("reload")}
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
        <TabBtn active={tab === "earnings"} onClick={() => setTab("earnings")}>
          {t("tabs.earnings")}
        </TabBtn>
        <TabBtn active={tab === "ratings"} onClick={() => setTab("ratings")}>
          {t("tabs.ratings")}
        </TabBtn>
        <TabBtn active={tab === "owners"} onClick={() => setTab("owners")}>
          {t("tabs.owners")}
        </TabBtn>
        <TabBtn active={tab === "financials"} onClick={() => setTab("financials")}>
          {t("tabs.financials")}
        </TabBtn>
      </div>

      {error && <div role="alert" className="text-sm text-[var(--red)]">{error}</div>}

      {tab === "earnings" && (
        <div className="space-y-2">
          {data?.earnings?.nextEarningsDate && (
            <div className="text-xs text-[var(--muted)]">
              {t("earnings.nextReport")}{" "}
              <strong className="text-[var(--foreground)]">
                {new Date(data.earnings.nextEarningsDate).toLocaleDateString(numLocale)}
              </strong>
            </div>
          )}
          {beatRate != null && (
            <div className="text-xs">
              <strong className={beatRate >= 75 ? "text-[var(--green)]" : beatRate >= 50 ? "text-yellow-400" : "text-[var(--red)]"}>
                {fmtPercent(beatRate, numLocale)}
              </strong>{" "}
              <span className="text-[var(--muted)]">
                {t("earnings.beatRate", { count: surprises.length })}
              </span>
            </div>
          )}
          {surprises.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">{t("earnings.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="text-left font-medium px-2 py-2">{t("earnings.columns.quarter")}</th>
                    <th className="text-right font-medium px-2 py-2">{t("earnings.columns.estimate")}</th>
                    <th className="text-right font-medium px-2 py-2">{t("earnings.columns.actual")}</th>
                    <th className="text-right font-medium px-2 py-2">{t("earnings.columns.surprise")}</th>
                  </tr>
                </thead>
                <tbody>
                  {surprises.map((p) => (
                    <tr key={p.date} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-2 py-2 font-medium">{p.date}</td>
                      <td className="px-2 py-2 text-right num text-[var(--muted)]">
                        {p.estimate != null ? fmtNumber(p.estimate, numLocale, 2) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right num">
                        {p.actual != null ? fmtNumber(p.actual, numLocale, 2) : "—"}
                      </td>
                      <td
                        className={`px-2 py-2 text-right num font-semibold ${
                          p.surprisePercent! > 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                        }`}
                      >
                        {p.surprisePercent! > 0 && "+"}
                        {fmtPercent(p.surprisePercent!, numLocale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "ratings" && (
        <div className="space-y-2">
          {(data?.ratings || []).length === 0 ? (
            <div className="text-xs text-[var(--muted)]">{t("ratings.empty")}</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-[var(--muted)] border-b border-[var(--border)] sticky top-0 bg-[var(--surface)]">
                  <tr>
                    <th className="text-left font-medium px-2 py-2">{t("ratings.columns.date")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("ratings.columns.analyst")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("ratings.columns.action")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("ratings.columns.rating")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.ratings || []).map((r, i) => {
                    const action = (r.action || "").toLowerCase() as ActionKey;
                    const color = ACTION_COLORS[action] || "text-[var(--muted)]";
                    const isKnownAction = action in ACTION_COLORS;
                    const label = isKnownAction
                      ? t(`ratings.actions.${action}` as Parameters<typeof t>[0])
                      : r.action || "—";
                    const ArrowIcon =
                      action === "up" ? TrendingUp : action === "down" ? TrendingDown : null;
                    return (
                      <tr
                        key={`${r.date}-${r.firm}-${i}`}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-2 py-2 text-[var(--muted)]">{r.date}</td>
                        <td className="px-2 py-2">{r.firm}</td>
                        <td className={`px-2 py-2 ${color} inline-flex items-center gap-1`}>
                          {ArrowIcon && <ArrowIcon size={12} aria-hidden="true" />}
                          {label}
                        </td>
                        <td className="px-2 py-2 text-[var(--muted)]">
                          {r.fromGrade && r.toGrade && r.fromGrade !== r.toGrade
                            ? `${r.fromGrade} → ${r.toGrade}`
                            : r.toGrade || r.fromGrade || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "owners" && (
        <div className="space-y-4">
          {data?.ownership && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="border border-[var(--border)] rounded p-2">
                <div className="text-[var(--muted)] flex items-center gap-1">
                  <Building2 size={11} aria-hidden="true" /> {t("owners.institutional")}
                </div>
                <div className="text-lg num font-semibold">
                  {data.ownership.institutionalPercentHeld != null
                    ? fmtPercent(data.ownership.institutionalPercentHeld * 100, numLocale)
                    : "—"}
                </div>
              </div>
              <div className="border border-[var(--border)] rounded p-2">
                <div className="text-[var(--muted)] flex items-center gap-1">
                  <Users size={11} aria-hidden="true" /> {t("owners.insider")}
                </div>
                <div className="text-lg num font-semibold">
                  {data.ownership.insiderPercentHeld != null
                    ? fmtPercent(data.ownership.insiderPercentHeld * 100, numLocale)
                    : "—"}
                </div>
              </div>
            </div>
          )}
          {data?.ownership && data.ownership.institutionalHolders.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                {t("owners.topInstitutional")}
              </div>
              <HolderList holders={data.ownership.institutionalHolders} currency={currency} numLocale={numLocale} />
            </div>
          )}
          {data?.ownership && data.ownership.fundHolders.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                {t("owners.topFunds")}
              </div>
              <HolderList holders={data.ownership.fundHolders} currency={currency} numLocale={numLocale} />
            </div>
          )}
          {(!data?.ownership ||
            (data.ownership.institutionalHolders.length === 0 &&
              data.ownership.fundHolders.length === 0)) && (
            <div className="text-xs text-[var(--muted)]">{t("owners.empty")}</div>
          )}
        </div>
      )}

      {tab === "financials" && (
        <div className="space-y-2">
          {!data?.financials || data.financials.annual.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">{t("financials.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="text-left font-medium px-2 py-2">{t("financials.metric")}</th>
                    {data.financials.annual.map((r) => (
                      <th key={r.endDate} className="text-right font-medium px-2 py-2">
                        {r.endDate.slice(0, 4)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <FinancialsRow
                    label={t("financials.revenue")}
                    rows={data.financials.annual}
                    pick={(r) => r.totalRevenue}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                    showGrowth
                  />
                  <FinancialsRow
                    label={t("financials.operatingIncome")}
                    rows={data.financials.annual}
                    pick={(r) => r.operatingIncome}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                  />
                  <FinancialsRow
                    label={t("financials.netIncome")}
                    rows={data.financials.annual}
                    pick={(r) => r.netIncome}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                    showGrowth
                  />
                  <FinancialsRow
                    label={t("financials.operatingCf")}
                    rows={data.financials.annual}
                    pick={(r) => r.operatingCashflow}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                  />
                  <FinancialsRow
                    label={t("financials.freeCf")}
                    rows={data.financials.annual}
                    pick={(r) =>
                      r.operatingCashflow != null && r.capitalExpenditures != null
                        ? r.operatingCashflow + r.capitalExpenditures
                        : undefined
                    }
                    currency={data.financials.currency}
                    numLocale={numLocale}
                  />
                  <FinancialsRow
                    label={t("financials.totalAssets")}
                    rows={data.financials.annual}
                    pick={(r) => r.totalAssets}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                  />
                  <FinancialsRow
                    label={t("financials.longTermDebt")}
                    rows={data.financials.annual}
                    pick={(r) => r.longTermDebt}
                    currency={data.financials.currency}
                    numLocale={numLocale}
                  />
                </tbody>
              </table>
              <div className="text-[10px] text-[var(--muted)] mt-2">
                {t("financials.currencyNote", { currency: data.financials.currency })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs -mb-px border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-[var(--accent)] text-[var(--foreground)]"
          : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function HolderList({
  holders,
  currency,
  numLocale,
}: {
  holders: Holder[];
  currency: string;
  numLocale: string;
}) {
  return (
    <div className="border border-[var(--border)] rounded overflow-hidden">
      <table className="w-full text-xs">
        <tbody>
          {holders.map((h) => (
            <tr key={h.organization} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-2 py-1.5">{h.organization}</td>
              <td className="px-2 py-1.5 text-right num text-[var(--muted)]">
                {h.pctHeld != null ? fmtPercent(h.pctHeld * 100, numLocale) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right num text-[var(--muted)]">
                {h.value != null ? fmtCurrency(h.value, currency, numLocale) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right num text-[10px] text-[var(--muted)]">
                {h.reportDate || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinancialsRow({
  label,
  rows,
  pick,
  currency,
  numLocale,
  showGrowth,
}: {
  label: string;
  rows: FinancialRow[];
  pick: (r: FinancialRow) => number | undefined;
  currency: string;
  numLocale: string;
  showGrowth?: boolean;
}) {
  // Berechne Jahreswachstum zum vorherigen Jahr (Yahoo sortiert absteigend)
  const values = rows.map((r) => pick(r));
  return (
    <tr className="border-b border-[var(--border)] last:border-b-0">
      <td className="px-2 py-2 font-medium">{label}</td>
      {rows.map((r, i) => {
        const v = values[i];
        const prev = values[i + 1];
        const growth =
          showGrowth && v != null && prev != null && prev !== 0
            ? ((v - prev) / Math.abs(prev)) * 100
            : null;
        return (
          <td key={r.endDate} className="px-2 py-2 text-right num">
            {v != null ? (
              <>
                {fmtCurrency(v, currency, numLocale)}
                {growth != null && (
                  <span
                    className={`block text-[10px] ${
                      growth > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                    }`}
                  >
                    {growth > 0 ? "+" : ""}
                    {fmtPercent(growth, numLocale)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
