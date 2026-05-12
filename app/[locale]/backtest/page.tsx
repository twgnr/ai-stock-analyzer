"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Activity,
  Play,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { EquityChart } from "@/components/EquityChart";

type StrategyKey =
  | "rsi-30-70"
  | "sma-20-50-cross"
  | "sma-50-200-cross"
  | "macd-cross"
  | "bollinger-breakout"
  | "buy-hold";

interface StrategyMeta {
  key: StrategyKey;
  label: string;
  description: string;
}

interface Trade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

interface BacktestResult {
  strategy: StrategyKey;
  ticker: string;
  range: string;
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  buyHoldReturnPct: number;
  trades: Trade[];
  winCount: number;
  lossCount: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  equityCurve: Array<{ time: number; equity: number }>;
  candleCount: number;
}

const RANGES: Array<{ value: string; label: string }> = [
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1J" },
  { value: "2y", label: "2J" },
  { value: "5y", label: "5J" },
  { value: "max", label: "max" },
];

export default function BacktestPage() {
  const t = useTranslations("Backtest");
  const locale = useLocale();
  const localeForDate = locale === "de" ? "de-DE" : "en-US";
  const localeForNumber = locale === "de" ? "de-DE" : "en-US";
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [ticker, setTicker] = useState("AAPL");
  const [strategy, setStrategy] = useState<StrategyKey>("rsi-30-70");
  const [range, setRange] = useState("2y");
  const [initialCapital, setInitialCapital] = useState(10000);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backtest")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.strategies)) setStrategies(d.strategies);
      })
      .catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          strategy,
          range,
          initialCapital,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorRun"));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  const strategyMeta = strategies.find((s) => s.key === strategy);
  const beatsBuyHold =
    result && result.totalReturnPct > result.buyHoldReturnPct;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity size={22} className="text-[var(--accent)]" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t.rich("description", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("form.ticker")}
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="input"
              placeholder={t("form.tickerPlaceholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("form.strategy")}
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as StrategyKey)}
              className="input"
            >
              {strategies.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("form.range")}
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="input"
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("form.initialCapital")}
            </label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value) || 0)}
              min={100}
              step={500}
              className="input"
            />
          </div>
        </div>
        {strategyMeta && (
          <div className="text-xs text-[var(--muted)]">
            {strategyMeta.description}
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={run}
            disabled={loading || !ticker.trim() || initialCapital <= 0}
            className="btn btn-primary"
          >
            {loading ? <div className="spinner" /> : <Play size={14} />}
            {t("start")}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label={t("stats.endCapital")}
              value={fmtCurrency(result.finalEquity, "EUR")}
              tone={result.totalReturnPct >= 0 ? "green" : "red"}
            />
            <Stat
              label={t("stats.strategyReturn")}
              value={`${result.totalReturnPct >= 0 ? "+" : ""}${fmtPercent(result.totalReturnPct)}`}
              tone={result.totalReturnPct >= 0 ? "green" : "red"}
            />
            <Stat
              label={t("stats.buyHold")}
              value={`${result.buyHoldReturnPct >= 0 ? "+" : ""}${fmtPercent(result.buyHoldReturnPct)}`}
              hint={beatsBuyHold ? t("stats.buyHoldBeat") : t("stats.buyHoldLose")}
              tone={beatsBuyHold ? "green" : "red"}
            />
            <Stat
              label={t("stats.maxDrawdown")}
              value={`−${fmtPercent(result.maxDrawdownPct)}`}
              tone="red"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t("stats.trades")} value={String(result.trades.length)} />
            <Stat
              label={t("stats.winRate")}
              value={`${fmtPercent(result.winRatePct)}`}
              hint={t("winLoss", { wins: result.winCount, losses: result.lossCount })}
            />
            <Stat
              label={t("stats.avgWin")}
              value={`+${fmtPercent(result.avgWinPct)}`}
              tone="green"
            />
            <Stat
              label={t("stats.avgLoss")}
              value={`${fmtPercent(result.avgLossPct)}`}
              tone="red"
            />
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-sm">
              {t("equityHeading", { ticker: result.ticker, range: result.range })}
            </h2>
            <EquityChart
              data={result.equityCurve}
              initialCapital={result.initialCapital}
              height={240}
            />
          </div>

          {result.trades.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("tradesHeading", { count: result.trades.length })}
              </h2>
              <div className="card overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-3">{t("table.entry")}</th>
                      <th className="text-left font-medium px-3 py-3">{t("table.exit")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("table.buy")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("table.sell")}</th>
                      <th className="text-right font-medium px-3 py-3">{t("table.pnlPct")}</th>
                      <th className="text-left font-medium px-3 py-3">{t("table.signal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((tr, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-3 py-2 text-xs text-[var(--muted)] num">
                          {new Date(tr.entryTime * 1000).toLocaleDateString(localeForDate)}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)] num">
                          {new Date(tr.exitTime * 1000).toLocaleDateString(localeForDate)}
                        </td>
                        <td className="px-3 py-2 text-right num text-xs">
                          {fmtNumber(tr.entryPrice, localeForNumber, 2)}
                        </td>
                        <td className="px-3 py-2 text-right num text-xs">
                          {fmtNumber(tr.exitPrice, localeForNumber, 2)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            tr.pnlPct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }`}
                        >
                          {tr.pnlPct >= 0 ? (
                            <TrendingUp size={12} className="inline mr-1" />
                          ) : (
                            <TrendingDown size={12} className="inline mr-1" />
                          )}
                          {tr.pnlPct >= 0 ? "+" : ""}
                          {fmtPercent(tr.pnlPct)}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">
                          {tr.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)]"
      : tone === "red"
        ? "text-[var(--red)]"
        : "";
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold num ${color}`}>{value}</div>
      {hint && <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>}
    </div>
  );
}
