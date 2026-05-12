"use client";

import { useCallback, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Sparkles,
  Gavel,
} from "lucide-react";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";

interface Scenario {
  label: string;
  narrative: string;
  keyDrivers: string[];
  priceTarget?: number;
  returnPercent?: number;
  probability?: number;
}

interface AdvocatusDiaboli {
  thesis: string;
  counterArguments: string[];
  warningSignals: string[];
}

interface Payload {
  ticker: string;
  currency: string;
  currentPrice: number;
  bull: Scenario;
  base: Scenario;
  bear: Scenario;
  advocatusDiaboli: AdvocatusDiaboli;
  summary: string;
}

export function BullBearPanel({ ticker, currency }: { ticker: string; currency: string }) {
  const t = useTranslations("AnalysisPanels.bullBear");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/bullbear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tCommon("error"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, tCommon]);

  // Erwartungswert (ohne Wdh): P_bull*R_bull + P_base*R_base + P_bear*R_bear
  const expectedReturn =
    data &&
    data.bull.probability != null &&
    data.base.probability != null &&
    data.bear.probability != null &&
    data.bull.returnPercent != null &&
    data.base.returnPercent != null &&
    data.bear.returnPercent != null
      ? data.bull.probability * data.bull.returnPercent +
        data.base.probability * data.base.returnPercent +
        data.bear.probability * data.bear.returnPercent
      : null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent)]" aria-hidden="true" />
          {t("title")}
        </h3>
        <button
          onClick={run}
          disabled={loading}
          className="btn btn-primary text-sm"
        >
          {loading ? <div className="spinner" /> : <Sparkles size={13} aria-hidden="true" />}
          {loading ? t("analyzing") : data ? t("regenerate") : t("generate")}
        </button>
      </div>

      <div className="text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {error && (
        <div role="alert" className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertTriangle size={14} aria-hidden="true" /> {error}
        </div>
      )}

      {data && (
        <div className="space-y-4 pt-2 border-t border-[var(--border)]">
          <div className="grid md:grid-cols-3 gap-3">
            <ScenarioCard
              scenario={data.bull}
              currency={currency}
              tone="green"
              icon={<TrendingUp size={14} aria-hidden="true" />}
              numLocale={numLocale}
            />
            <ScenarioCard
              scenario={data.base}
              currency={currency}
              tone="neutral"
              icon={<Minus size={14} aria-hidden="true" />}
              numLocale={numLocale}
            />
            <ScenarioCard
              scenario={data.bear}
              currency={currency}
              tone="red"
              icon={<TrendingDown size={14} aria-hidden="true" />}
              numLocale={numLocale}
            />
          </div>

          {expectedReturn != null && (
            <div className="border border-[var(--border)] rounded p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="text-[var(--muted)]">{t("expectedReturn")}</span>
              </div>
              <div
                className={`text-xl num font-semibold ${
                  expectedReturn >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {expectedReturn > 0 ? "+" : ""}
                {fmtPercent(expectedReturn, numLocale)}
              </div>
            </div>
          )}

          <div className="border border-yellow-500/30 bg-yellow-500/5 rounded p-3 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-yellow-400">
              <Gavel size={14} aria-hidden="true" />
              {t("advocatusDiaboli")}
            </div>
            <p className="text-sm font-medium">{data.advocatusDiaboli.thesis}</p>
            {data.advocatusDiaboli.counterArguments.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  {t("counterArguments")}
                </div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {data.advocatusDiaboli.counterArguments.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.advocatusDiaboli.warningSignals.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  {t("warningSignals")}
                </div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {data.advocatusDiaboli.warningSignals.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-sm">{data.summary}</p>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({
  scenario,
  currency,
  tone,
  icon,
  numLocale,
}: {
  scenario: Scenario;
  currency: string;
  tone: "green" | "red" | "neutral";
  icon: React.ReactNode;
  numLocale: string;
}) {
  const t = useTranslations("AnalysisPanels.bullBear");
  const color =
    tone === "green"
      ? "text-[var(--green)] border-[var(--green)]/30 bg-green-500/5"
      : tone === "red"
        ? "text-[var(--red)] border-[var(--red)]/30 bg-red-500/5"
        : "text-[var(--foreground)] border-[var(--border)]";
  return (
    <div className={`border rounded p-3 space-y-2 ${color}`}>
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-1">
          {icon}
          {scenario.label}
        </div>
        {scenario.probability != null && (
          <span className="text-xs num font-semibold">
            {t("probability", { value: fmtPercent(scenario.probability * 100, numLocale) })}
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--foreground)]">{scenario.narrative}</p>
      {scenario.keyDrivers.length > 0 && (
        <ul className="list-disc pl-4 text-xs space-y-0.5 text-[var(--foreground)]">
          {scenario.keyDrivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {(scenario.priceTarget != null || scenario.returnPercent != null) && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)] text-xs">
          {scenario.priceTarget != null && (
            <div>
              <div className="text-[var(--muted)]">{t("priceTarget")}</div>
              <div className="num font-semibold">
                {fmtCurrency(scenario.priceTarget, currency, numLocale)}
              </div>
            </div>
          )}
          {scenario.returnPercent != null && (
            <div>
              <div className="text-[var(--muted)]">{t("return")}</div>
              <div className="num font-semibold">
                {scenario.returnPercent > 0 ? "+" : ""}
                {fmtNumber(scenario.returnPercent, numLocale, 1)}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
