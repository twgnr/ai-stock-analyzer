"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Calculator,
  Play,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";

interface ScenarioResult {
  fairValuePerShare: number;
  enterpriseValue: number;
  equityValue: number;
  terminalValue: number;
  pvOfTerminalValue: number;
  warnings: string[];
  inputs: {
    initialFcf: number;
    sharesOutstanding: number;
    netDebt: number;
    years: number;
    initialGrowthPct: number;
    terminalGrowthPct: number;
    waccPct: number;
  };
}

interface DcfPayload {
  ticker: string;
  currency: string;
  currentPrice: number | null;
  defaults: {
    initialFcf: number;
    sharesOutstanding: number;
    netDebt: number;
  };
  scenarios: {
    bear: ScenarioResult;
    base: ScenarioResult;
    bull: ScenarioResult;
  };
  reverse: {
    impliedGrowthPct: number | null;
    interpretation: string;
    iterations: number;
  } | null;
}

interface Props {
  ticker: string;
  currency: string;
}

export function DcfPanel({ ticker, currency }: Props) {
  const t = useTranslations("AnalysisPanels.dcf");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DcfPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User-Inputs (mit Defaults)
  const [initialFcf, setInitialFcf] = useState<string>("");
  const [growthPct, setGrowthPct] = useState(6);
  const [terminalGrowthPct, setTerminalGrowthPct] = useState(2.5);
  const [waccPct, setWaccPct] = useState(9);
  const [years, setYears] = useState(10);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ticker,
        initialGrowthPct: growthPct,
        terminalGrowthPct,
        waccPct,
        years,
      };
      if (initialFcf && Number(initialFcf) > 0) {
        body.initialFcf = Number(initialFcf);
      }
      const res = await fetch("/api/analyze/dcf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.defaults?.initialFcf != null) {
          setInitialFcf(String(json.defaults.initialFcf));
        }
        throw new Error(json.error || t("errorFallback"));
      }
      setData(json);
      // Nach erster Auto-Berechnung den ermittelten FCF in den Input übernehmen,
      // damit der User ihn sieht und ggf. anpassen kann
      if (!initialFcf) {
        setInitialFcf(String(json.defaults.initialFcf));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, initialFcf, growthPct, terminalGrowthPct, waccPct, years, t, tCommon]);

  useEffect(() => {
    if (open && !data && !loading) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return (
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-[var(--accent)]" />
          <div>
            <div className="font-semibold text-sm">{t("cardTitle")}</div>
            <div className="text-xs text-[var(--muted)]">
              {t("cardSubtitle")}
            </div>
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="btn btn-primary">
          <Play size={14} /> {t("start")}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
        </div>
        <button onClick={() => setOpen(false)} className="btn text-xs">
          {t("close")}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
        <Input
          label={t("fields.initialFcf")}
          value={initialFcf}
          onChange={setInitialFcf}
          placeholder={
            data?.defaults.initialFcf != null
              ? fmtNumber(data.defaults.initialFcf, numLocale, 0)
              : t("fields.autoPlaceholder")
          }
        />
        <NumberInput label={t("fields.growthPhase1")} value={growthPct} onChange={setGrowthPct} step={0.5} suffix="%" />
        <NumberInput label={t("fields.terminalGrowth")} value={terminalGrowthPct} onChange={setTerminalGrowthPct} step={0.25} suffix="%" />
        <NumberInput label={t("fields.wacc")} value={waccPct} onChange={setWaccPct} step={0.5} suffix="%" />
        <NumberInput label={t("fields.years")} value={years} onChange={setYears} step={1} />
      </div>

      <div className="flex justify-end">
        <button onClick={run} disabled={loading} className="btn btn-primary">
          {loading ? <div className="spinner" /> : <Play size={14} />}
          {t("recompute")}
        </button>
      </div>

      {error && (
        <div className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <Scenario
              label="Bear"
              icon={<TrendingDown size={14} className="text-[var(--red)]" />}
              scenario={data.scenarios.bear}
              price={data.currentPrice}
              currency={data.currency}
              numLocale={numLocale}
            />
            <Scenario
              label="Base"
              icon={<Minus size={14} className="text-[var(--muted)]" />}
              scenario={data.scenarios.base}
              price={data.currentPrice}
              currency={data.currency}
              numLocale={numLocale}
              highlight
            />
            <Scenario
              label="Bull"
              icon={<TrendingUp size={14} className="text-[var(--green)]" />}
              scenario={data.scenarios.bull}
              price={data.currentPrice}
              currency={data.currency}
              numLocale={numLocale}
            />
          </div>

          {data.reverse && (
            <div className="border border-[var(--accent)]/30 bg-blue-500/5 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Calculator size={13} className="text-[var(--accent)]" />
                <span className="font-semibold text-sm">{t("reverse.title")}</span>
                <span className="text-xs text-[var(--muted)]">
                  {t("reverse.subtitle")}
                </span>
              </div>
              {data.reverse.impliedGrowthPct != null ? (
                <>
                  <div className="text-2xl font-bold num text-[var(--accent)]">
                    {t("reverse.perYearFor", {
                      value: `${data.reverse.impliedGrowthPct > 0 ? "+" : ""}${fmtPercent(data.reverse.impliedGrowthPct, numLocale)}`,
                      years: data.scenarios.base.inputs.years,
                    })}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {data.reverse.interpretation}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[var(--muted)]">
                  {data.reverse.interpretation}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-[var(--muted)] grid sm:grid-cols-3 gap-x-4 gap-y-1 pt-2 border-t border-[var(--border)]">
            <div>
              {t("stats.startFcf")}{" "}
              <strong className="num text-[var(--foreground)]">
                {fmtCurrency(data.defaults.initialFcf, currency, numLocale)}
              </strong>
            </div>
            <div>
              {t("stats.shares")}{" "}
              <strong className="num text-[var(--foreground)]">
                {fmtNumber(data.defaults.sharesOutstanding / 1e6, numLocale, 1)} {t("stats.sharesUnit")}
              </strong>
            </div>
            <div>
              {t("stats.netDebt")}{" "}
              <strong className="num text-[var(--foreground)]">
                {fmtCurrency(data.defaults.netDebt, currency, numLocale)}
              </strong>
            </div>
          </div>

          <div className="text-[10px] text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("footer")}
          </div>
        </div>
      )}
    </div>
  );
}

function Scenario({
  label,
  icon,
  scenario,
  price,
  currency,
  numLocale,
  highlight = false,
}: {
  label: string;
  icon: React.ReactNode;
  scenario: ScenarioResult;
  price: number | null;
  currency: string;
  numLocale: string;
  highlight?: boolean;
}) {
  const t = useTranslations("AnalysisPanels.dcf");
  const upside =
    price != null && price > 0
      ? ((scenario.fairValuePerShare - price) / price) * 100
      : null;
  return (
    <div
      className={`border rounded-lg p-3 space-y-1 ${
        highlight ? "border-[var(--accent)]/40 bg-blue-500/5" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-[10px] text-[var(--muted)]">
          {t("scenarioGrowth", {
            value: `${scenario.inputs.initialGrowthPct > 0 ? "+" : ""}${fmtPercent(scenario.inputs.initialGrowthPct, numLocale)}`,
          })}
        </span>
      </div>
      <div className="text-xl font-bold num">
        {fmtCurrency(scenario.fairValuePerShare, currency, numLocale)}
      </div>
      {upside != null && (
        <div
          className={`text-sm num ${
            upside > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
          }`}
        >
          {upside > 0 ? "+" : ""}
          {fmtPercent(upside, numLocale)} {t("vsPrice")}
        </div>
      )}
      {scenario.warnings.length > 0 && (
        <div className="text-[10px] text-yellow-400">
          ⚠ {scenario.warnings[0]}
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1">
        {label}
        {suffix && <span className="text-[var(--muted)]"> ({suffix})</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        step={step}
        className="input"
      />
    </div>
  );
}
