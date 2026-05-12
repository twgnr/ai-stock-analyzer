"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  UserRoundCog,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { fmtCurrency, fmtNumber } from "@/lib/format";

interface InsiderTrade {
  name?: string;
  relation?: string;
  transactionText?: string;
  shares?: number;
  value?: number;
  date?: string;
  filerUrl?: string;
}

interface Props {
  ticker: string;
  currency?: string;
}

export function InsiderPanel({ ticker, currency = "USD" }: Props) {
  const t = useTranslations("AnalysisPanels.insider");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const [trades, setTrades] = useState<InsiderTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/insider/${encodeURIComponent(ticker)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("loadError"));
      setTrades(Array.isArray(json.trades) ? json.trades : []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, t, tCommon]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loaded && !loading) return null;

  const buys = trades.filter((tr) => (tr.shares || 0) > 0);
  const sells = trades.filter((tr) => (tr.shares || 0) < 0);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserRoundCog size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
        <span className="text-xs text-[var(--muted)]">
          {t("subtitle")}
        </span>
      </div>

      {error && (
        <div className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--muted)] flex items-center gap-2">
          <div className="spinner" /> {t("loading")}
        </div>
      ) : trades.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">
          {t("empty")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("buys")} value={String(buys.length)} tone="green" />
            <Stat label={t("sells")} value={String(sells.length)} tone="red" />
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-2 py-2">{t("columns.date")}</th>
                  <th className="text-left font-medium px-2 py-2">{t("columns.name")}</th>
                  <th className="text-left font-medium px-2 py-2">{t("columns.action")}</th>
                  <th className="text-right font-medium px-2 py-2">{t("columns.shares")}</th>
                  <th className="text-right font-medium px-2 py-2">{t("columns.value")}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((tr, i) => {
                  const isBuy = (tr.shares || 0) > 0;
                  return (
                    <tr
                      key={i}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-2 py-2 text-xs text-[var(--muted)] num">
                        {tr.date || "—"}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <div className="font-medium">{tr.name || "—"}</div>
                        {tr.relation && (
                          <div className="text-[var(--muted)]">{tr.relation}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <span
                          className={
                            isBuy ? "text-[var(--green)]" : "text-[var(--red)]"
                          }
                        >
                          {isBuy ? (
                            <TrendingUp size={11} className="inline mr-1" />
                          ) : (
                            <TrendingDown size={11} className="inline mr-1" />
                          )}
                          {tr.transactionText || (isBuy ? t("buyLabel") : t("sellLabel"))}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right num text-xs">
                        {tr.shares != null
                          ? fmtNumber(Math.abs(tr.shares), numLocale, 0)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right num text-xs">
                        {tr.value != null
                          ? fmtCurrency(Math.abs(tr.value), currency, numLocale)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("source")}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)]"
      : tone === "red"
        ? "text-[var(--red)]"
        : "";
  return (
    <div className="border border-[var(--border)] rounded p-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`text-lg font-semibold num ${color}`}>{value}</div>
    </div>
  );
}
