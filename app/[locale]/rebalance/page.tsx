"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Scale,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Lightbulb,
} from "lucide-react";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";

interface Bucket {
  label: string;
  targetWeight: number;
  tickers: string[];
}

interface BucketEval {
  label: string;
  targetWeight: number;
  currentWeight: number;
  currentValueBase: number;
  targetValueBase: number;
  deltaBase: number;
  deltaPct: number;
  action: "buy" | "sell" | "hold";
  tickers: string[];
  tickerDetails: Array<{ ticker: string; valueBase: number }>;
}

interface Suggest {
  buckets: BucketEval[];
  totalValueBase: number;
  baseCurrency: string;
  thresholdPct: number;
  unassigned?: Array<{ ticker: string; valueBase: number }>;
}

export default function RebalancePage() {
  const t = useTranslations("Rebalance");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [thresholdPct, setThresholdPct] = useState(5);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch("/api/rebalance/targets"),
        fetch("/api/rebalance/suggest"),
      ]);
      if (tRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error || t("errorLoadFailed"));
      setBuckets(Array.isArray(tData.buckets) ? tData.buckets : []);
      setThresholdPct(tData.thresholdPct ?? 5);

      const sData = await sRes.json();
      if (sRes.ok && !sData.error) setSuggest(sData);
      else setSuggest(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalWeight = useMemo(
    () => buckets.reduce((s, b) => s + (Number(b.targetWeight) || 0), 0),
    [buckets]
  );

  function addBucket() {
    setBuckets((prev) => [...prev, { label: t("newBucketName"), targetWeight: 0, tickers: [] }]);
  }

  function removeBucket(idx: number) {
    setBuckets((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateBucket(idx: number, patch: Partial<Bucket>) {
    setBuckets((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/rebalance/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buckets, thresholdPct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorSaveFailed"));
      setMessage(t("savedToast"));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function presetFromAllocation(mode: "sectors" | "regions") {
    setError(null);
    try {
      const res = await fetch("/api/portfolio/allocation");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const items: Array<{ label: string; tickers: string[]; weight: number }> =
        mode === "sectors" ? data.sectors : data.regions;
      if (!items || items.length === 0) {
        setError(t("noAllocationData"));
        return;
      }
      const equal = 100 / items.length;
      setBuckets(
        items.map((i) => ({
          label: i.label,
          targetWeight: Math.round(equal * 10) / 10,
          tickers: [...new Set(i.tickers.map((t) => t.toUpperCase()))],
        }))
      );
      setMessage(
        t("presetToast", {
          count: items.length,
          source: mode === "sectors" ? t("presetFromSectorsLabel") : t("presetFromRegionsLabel"),
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Scale size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <button onClick={load} className="btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("refresh")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("description", { currency: suggest?.baseCurrency || "EUR" })}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div role="status" className="card p-3 text-[var(--green)] flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">{t("targetBuckets")}</h2>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => presetFromAllocation("sectors")} className="btn">
              <Lightbulb size={14} />
              {t("fromSectors")}
            </button>
            <button onClick={() => presetFromAllocation("regions")} className="btn">
              <Lightbulb size={14} />
              {t("fromRegions")}
            </button>
            <button onClick={addBucket} className="btn">
              <Plus size={14} />
              {t("newBucket")}
            </button>
          </div>
        </div>

        {buckets.length === 0 ? (
          <div className="text-sm text-[var(--muted)] text-center py-6">
            {t("noBuckets")}
          </div>
        ) : (
          <div className="space-y-2">
            {buckets.map((b, idx) => (
              <div
                key={idx}
                className="border border-[var(--border)] rounded-lg p-3 space-y-2"
              >
                <div className="flex gap-2 flex-wrap items-start">
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => updateBucket(idx, { label: e.target.value })}
                    placeholder={t("bucketNamePlaceholder")}
                    className="input flex-1 min-w-[150px]"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={b.targetWeight}
                      onChange={(e) =>
                        updateBucket(idx, {
                          targetWeight: Number(e.target.value) || 0,
                        })
                      }
                      min={0}
                      max={100}
                      step={0.1}
                      className="input w-20 text-right"
                    />
                    <span className="text-sm text-[var(--muted)]">%</span>
                  </div>
                  <button
                    onClick={() => removeBucket(idx)}
                    className="p-2 text-[var(--muted)] hover:text-[var(--red)]"
                    title={t("deleteBucket")}
                    aria-label={t("deleteBucket")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  value={b.tickers.join(", ")}
                  onChange={(e) =>
                    updateBucket(idx, {
                      tickers: e.target.value
                        .split(/[,\s]+/)
                        .map((tk) => tk.toUpperCase().trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t("tickersPlaceholder")}
                  className="input"
                />
              </div>
            ))}

            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-[var(--muted)]">{t("weightSum")}</span>
              <span
                className={`num font-semibold ${
                  Math.abs(totalWeight - 100) < 0.5
                    ? "text-[var(--green)]"
                    : "text-[var(--red)]"
                }`}
              >
                {t("weightSumValue", { value: fmtNumber(totalWeight, numberLocale, 1) })}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">
              {t("tolerance")}
            </span>
            <input
              type="number"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value) || 0)}
              min={0}
              max={50}
              step={0.5}
              className="input w-20 text-right"
            />
            <span className="text-[var(--muted)]">%</span>
          </div>
          <button
            onClick={save}
            disabled={saving || (buckets.length > 0 && Math.abs(totalWeight - 100) > 0.5)}
            className="btn btn-primary"
          >
            {saving ? <div className="spinner" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>

      {suggest && suggest.buckets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">{t("suggestionHeading")}</h2>
            <div className="text-xs text-[var(--muted)]">
              {t("totalValue", { value: fmtCurrency(suggest.totalValueBase, suggest.baseCurrency) })}
            </div>
          </div>

          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("headers.bucket")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("headers.current")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("headers.target")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("headers.delta")}</th>
                  <th className="text-right font-medium px-3 py-3">
                    {t("headers.action", { currency: suggest.baseCurrency })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggest.buckets.map((b, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--border)] last:border-b-0 align-top"
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">{b.label}</div>
                      {b.tickerDetails.length > 0 && (
                        <div className="text-xs text-[var(--muted)] mt-1">
                          {b.tickerDetails
                            .slice(0, 4)
                            .map(
                              (tk) =>
                                `${tk.ticker} (${fmtCurrency(tk.valueBase, suggest.baseCurrency)})`
                            )
                            .join(", ")}
                          {b.tickerDetails.length > 4
                            ? t("moreTickers", { count: b.tickerDetails.length - 4 })
                            : ""}
                        </div>
                      )}
                      {b.tickers.length === 0 && (
                        <div className="text-xs text-yellow-400 mt-1">
                          {t("noTickers")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right num">
                      {fmtPercent(b.currentWeight)}
                      <div className="text-xs text-[var(--muted)]">
                        {fmtCurrency(b.currentValueBase, suggest.baseCurrency)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right num">
                      {fmtPercent(b.targetWeight)}
                      <div className="text-xs text-[var(--muted)]">
                        {fmtCurrency(b.targetValueBase, suggest.baseCurrency)}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-3 text-right num ${
                        Math.abs(b.deltaPct) < suggest.thresholdPct
                          ? "text-[var(--muted)]"
                          : b.deltaPct > 0
                            ? "text-[var(--red)]"
                            : "text-[var(--green)]"
                      }`}
                    >
                      {b.deltaPct >= 0 ? "+" : ""}
                      {fmtPercent(b.deltaPct)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ActionBadge action={b.action} deltaBase={b.deltaBase} baseCurrency={suggest.baseCurrency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {suggest.unassigned && suggest.unassigned.length > 0 && (
            <div className="card p-4 space-y-2">
              <h3 className="font-semibold text-sm">
                {t("unassignedTitle", { count: suggest.unassigned.length })}
              </h3>
              <div className="text-xs text-[var(--muted)]">
                {t("unassignedHint")}
              </div>
              <div className="flex gap-2 flex-wrap">
                {suggest.unassigned.map((u) => (
                  <span
                    key={u.ticker}
                    className="text-xs border border-[var(--border)] rounded px-2 py-1"
                  >
                    {u.ticker} ({fmtCurrency(u.valueBase, suggest.baseCurrency)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBadge({
  action,
  deltaBase,
  baseCurrency,
}: {
  action: "buy" | "sell" | "hold";
  deltaBase: number;
  baseCurrency: string;
}) {
  const t = useTranslations("Rebalance");
  if (action === "hold") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
        <Minus size={12} />
        {t("hold")}
      </span>
    );
  }
  if (action === "buy") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--green)]">
        <ArrowUpRight size={14} />
        {t("buy", { amount: fmtCurrency(Math.abs(deltaBase), baseCurrency) })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--red)]">
      <ArrowDownRight size={14} />
      {t("sell", { amount: fmtCurrency(Math.abs(deltaBase), baseCurrency) })}
    </span>
  );
}
