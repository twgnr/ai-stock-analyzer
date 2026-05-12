"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Trophy,
  Filter,
  Play,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  ChevronsUpDown,
  Settings2,
  RefreshCw,
  Users,
  Clock,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";
import { useFxRates } from "@/lib/useFxRates";
import { PayoutFrequencyBadge } from "@/components/PayoutFrequencyBadge";

interface Row {
  ticker: string;
  name?: string;
  currency: string;
  price?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
  country?: string;
  region: string;
  dividendRate?: number;
  dividendYieldPct?: number;
  payoutRatioPct?: number;
  payoutsPerYear: number;
  payoutFrequency: string;
  exDividendDate?: string;
  growthCagr3yPct?: number | null;
  growthCagr5yPct?: number | null;
  growthCagr10yPct?: number | null;
  streakYears: number;
  peRatio?: number;
  beta?: number;
  score: number;
  scoreBreakdown?: {
    yield: number;
    growth: number;
    safety: number;
    streak: number;
  };
}

interface SnapshotMeta {
  scannedAt: string | null;
  universeSize: number;
  scanDurationMs: number | null;
  scanInProgress: boolean;
  sharedRowCount: number;
  extraRowCount: number;
}

interface Payload {
  rows: Row[];
  snapshot: SnapshotMeta;
}

type SortKey =
  | "score"
  | "dividendYieldPct"
  | "growthCagr5yPct"
  | "payoutRatioPct"
  | "streakYears"
  | "peRatio"
  | "marketCap"
  | "ticker";

const SECTOR_OPTIONS = [
  "Technology",
  "Consumer Defensive",
  "Healthcare",
  "Industrials",
  "Financial Services",
  "Consumer Cyclical",
  "Basic Materials",
  "Energy",
  "Real Estate",
  "Utilities",
  "Communication Services",
];

const FREQ_OPTIONS = ["monthly", "quarterly", "semiannual", "annual"];

export default function DividendScreenerPage() {
  const t = useTranslations("Dividends.screener");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [includePortfolio, setIncludePortfolio] = useState(true);
  const [includeWatchlist, setIncludeWatchlist] = useState(false);
  const [customTickers, setCustomTickers] = useState("");

  // Filter
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [freqFilter, setFreqFilter] = useState<string>("all");
  const [minYield, setMinYield] = useState(0);
  const [maxPayout, setMaxPayout] = useState(100);
  const [minStreak, setMinStreak] = useState(0);
  const [minCagr5y, setMinCagr5y] = useState<number | "">("");
  const [minMarketCap, setMinMarketCap] = useState<"any" | "small" | "mid" | "large" | "mega">(
    "any"
  );
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dividends/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includePortfolio,
          includeWatchlist,
          customTickers: customTickers
            .split(/[,\s]+/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [includePortfolio, includeWatchlist, customTickers, t]);

  const triggerScan = useCallback(async () => {
    if (!confirm(t("scanConfirm"))) return;
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/dividends/screener/scan", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(
        t("scanDoneMessage", {
          count: json.snapshot.sharedRowCount,
          universe: json.snapshot.universeSize,
          seconds: Math.round((json.snapshot.scanDurationMs || 0) / 1000),
        })
      );
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scanFailed"));
    } finally {
      setScanning(false);
    }
  }, [run, t]);

  // Auto-Run beim ersten Öffnen
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCurrencies = useMemo(
    () => [...new Set((data?.rows || []).map((r) => r.currency).filter(Boolean))],
    [data]
  );
  const { toBase, base } = useFxRates(allCurrencies);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.rows || []) if (r.sector) s.add(r.sector);
    return [...s].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data?.rows || [];
    return rows.filter((r) => {
      if (regionFilter !== "all" && r.region !== regionFilter) return false;
      if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
      if (freqFilter !== "all" && r.payoutFrequency !== freqFilter) return false;
      if (minYield > 0 && (r.dividendYieldPct ?? 0) < minYield) return false;
      if (
        maxPayout < 100 &&
        r.payoutRatioPct != null &&
        r.payoutRatioPct > maxPayout
      )
        return false;
      if (minStreak > 0 && r.streakYears < minStreak) return false;
      if (
        minCagr5y !== "" &&
        (r.growthCagr5yPct ?? -Infinity) < (minCagr5y as number)
      )
        return false;
      if (minMarketCap !== "any") {
        const mc = r.marketCap ?? 0;
        if (minMarketCap === "small" && mc < 300e6) return false;
        if (minMarketCap === "mid" && mc < 2e9) return false;
        if (minMarketCap === "large" && mc < 10e9) return false;
        if (minMarketCap === "mega" && mc < 200e9) return false;
      }
      return true;
    });
  }, [
    data,
    regionFilter,
    sectorFilter,
    freqFilter,
    minYield,
    maxPayout,
    minStreak,
    minCagr5y,
    minMarketCap,
  ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "number" ? av : av == null ? -Infinity : 0;
      const bn = typeof bv === "number" ? bv : bv == null ? -Infinity : 0;
      if (sortKey === "ticker") {
        return sortDir === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "ticker" ? "asc" : "desc");
    }
  }

  function SortHeader({
    k,
    children,
    className = "",
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`font-medium px-3 py-3 cursor-pointer hover:text-[var(--foreground)] ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp size={10} />
            ) : (
              <ArrowDown size={10} />
            )
          ) : (
            <ChevronsUpDown size={10} className="opacity-40" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={22} className="text-yellow-400" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={run} disabled={loading || scanning} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
          <button
            onClick={triggerScan}
            disabled={scanning || loading}
            className="btn btn-primary"
            title={t("scanTooltip")}
          >
            {scanning ? <div className="spinner" /> : <Play size={14} />}
            {scanning ? t("scanning") : t("scan")}
          </button>
        </div>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t.rich("intro", {
          bold: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>

      {data?.snapshot && (
        <div className="card p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Users size={13} className="text-[var(--accent)]" />
            <span className="font-semibold">{t("snapshotLabel")}</span>
            {data.snapshot.scannedAt ? (
              <>
                <span>
                  <strong className="num text-[var(--foreground)]">
                    {data.snapshot.sharedRowCount}
                  </strong>{" "}
                  {t("snapshotPayersSuffix")}
                </span>
                <Clock size={11} className="text-[var(--muted)]" />
                <span
                  className={
                    ageHighlightClass(data.snapshot.scannedAt) || "text-[var(--muted)]"
                  }
                >
                  {t("snapshotLastScannedPrefix")}{" "}
                  {new Date(data.snapshot.scannedAt).toLocaleString(dateLocale)}
                  {data.snapshot.scanDurationMs != null && (
                    <> {t("snapshotDuration", { seconds: Math.round(data.snapshot.scanDurationMs / 1000) })}</>
                  )}
                </span>
              </>
            ) : (
              <span className="text-yellow-400">
                {t("snapshotNever")}
              </span>
            )}
            {data.snapshot.extraRowCount > 0 && (
              <span className="text-[var(--muted)]">
                {t("snapshotExtra", { count: data.snapshot.extraRowCount })}
              </span>
            )}
          </div>
          {data.snapshot.scanInProgress && (
            <div className="text-yellow-400">
              {t("snapshotInProgress")}
            </div>
          )}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Settings2 size={14} /> {t("universe")}
        </h2>
        <div className="flex gap-4 flex-wrap text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includePortfolio}
              onChange={(e) => setIncludePortfolio(e.target.checked)}
            />
            {t("portfolio")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeWatchlist}
              onChange={(e) => setIncludeWatchlist(e.target.checked)}
            />
            {t("watchlist")}
          </label>
        </div>
        <input
          value={customTickers}
          onChange={(e) => setCustomTickers(e.target.value)}
          placeholder={t("customPlaceholder")}
          className="input"
        />
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Filter size={14} /> {t("filter")}
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <FilterSelect
            label={t("region")}
            value={regionFilter}
            onChange={setRegionFilter}
            options={[
              { value: "all", label: t("regionAll") },
              { value: "USA", label: t("regionUS") },
              { value: "Deutschland", label: t("regionDE") },
              { value: "Europa", label: t("regionEU") },
              { value: "Kanada", label: t("regionCA") },
              { value: "Asien", label: t("regionAsia") },
              { value: "Australien", label: t("regionAU") },
            ]}
          />
          <FilterSelect
            label={t("sector")}
            value={sectorFilter}
            onChange={setSectorFilter}
            options={[
              { value: "all", label: t("sectorAll") },
              ...(sectors.length > 0 ? sectors : SECTOR_OPTIONS).map((s) => ({
                value: s,
                label: s,
              })),
            ]}
          />
          <FilterSelect
            label={t("payoutFrequency")}
            value={freqFilter}
            onChange={setFreqFilter}
            options={[
              { value: "all", label: t("freqAll") },
              ...FREQ_OPTIONS.map((f) => ({ value: f, label: f })),
            ]}
          />
          <FilterSelect
            label={t("marketCapLabel")}
            value={minMarketCap}
            onChange={(v) => setMinMarketCap(v as typeof minMarketCap)}
            options={[
              { value: "any", label: t("marketCap.any") },
              { value: "small", label: t("marketCap.small") },
              { value: "mid", label: t("marketCap.mid") },
              { value: "large", label: t("marketCap.large") },
              { value: "mega", label: t("marketCap.mega") },
            ]}
          />
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <RangeInput
            label={t("minYield")}
            value={minYield}
            onChange={setMinYield}
            min={0}
            max={15}
            step={0.5}
            suffix="%"
          />
          <RangeInput
            label={t("maxPayout")}
            value={maxPayout}
            onChange={setMaxPayout}
            min={0}
            max={150}
            step={5}
            suffix="%"
          />
          <RangeInput
            label={t("minStreak")}
            value={minStreak}
            onChange={setMinStreak}
            min={0}
            max={25}
            step={1}
            suffix={t("streakSuffix")}
          />
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">
              {t("min5yCagr")}
            </label>
            <input
              type="number"
              value={minCagr5y}
              onChange={(e) =>
                setMinCagr5y(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder={t("min5yCagrPlaceholder")}
              step={0.5}
              className="input"
            />
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div role="status" className="card p-3 text-[var(--green)] text-sm">{message}</div>
      )}

      <div className="text-sm text-[var(--muted)] flex items-center gap-3 flex-wrap">
        {data ? (
          <span>
            {t.rich("resultsCount", {
              count: sorted.length,
              total: data.rows.length,
              strong: (chunks) => <strong className="text-[var(--foreground)] num">{chunks}</strong>,
            })}
          </span>
        ) : (
          <span>{t("loadingShort")}</span>
        )}
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {t("empty")}
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <SortHeader k="ticker" className="text-left">
                  {t("thTicker")}
                </SortHeader>
                <th className="text-left font-medium px-3 py-3">{t("thSectorRegion")}</th>
                <SortHeader k="score" className="text-right">
                  {t("thScore")}
                </SortHeader>
                <SortHeader k="dividendYieldPct" className="text-right">
                  {t("thYield")}
                </SortHeader>
                <SortHeader k="growthCagr5yPct" className="text-right">
                  {t("th5yCagr")}
                </SortHeader>
                <SortHeader k="streakYears" className="text-right">
                  {t("thStreak")}
                </SortHeader>
                <SortHeader k="payoutRatioPct" className="text-right">
                  {t("thPayout")}
                </SortHeader>
                <SortHeader k="peRatio" className="text-right">
                  {t("thPE")}
                </SortHeader>
                <th className="text-left font-medium px-3 py-3">{t("thFrequency")}</th>
                <SortHeader k="marketCap" className="text-right">
                  {t("thMCap")}
                </SortHeader>
                <th className="text-right font-medium px-3 py-3">{t("thRatePerYear")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rateBase = r.dividendRate != null ? toBase(r.dividendRate, r.currency) : null;
                const mcBase = r.marketCap != null ? toBase(r.marketCap, r.currency) : null;
                return (
                  <tr
                    key={r.ticker}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/analysis/${encodeURIComponent(r.ticker)}`}
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {r.ticker}
                      </Link>
                      {r.name && (
                        <div className="text-[10px] text-[var(--muted)] truncate max-w-[180px]">
                          {r.name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.sector && (
                        <div className="truncate max-w-[140px]">{r.sector}</div>
                      )}
                      <div className="text-[10px] text-[var(--muted)]">
                        {r.region}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 text-right num font-bold"
                      title={
                        r.scoreBreakdown
                          ? t("scoreTooltip", {
                              yield: r.scoreBreakdown.yield,
                              growth: r.scoreBreakdown.growth,
                              safety: r.scoreBreakdown.safety,
                              streak: r.scoreBreakdown.streak,
                            })
                          : undefined
                      }
                    >
                      <span
                        className={
                          r.score >= 70
                            ? "text-[var(--green)]"
                            : r.score >= 40
                              ? ""
                              : "text-[var(--muted)]"
                        }
                      >
                        {r.score}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right num">
                      {r.dividendYieldPct != null
                        ? fmtPercent(r.dividendYieldPct, dateLocale)
                        : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right num ${
                        r.growthCagr5yPct != null && r.growthCagr5yPct >= 0
                          ? "text-[var(--green)]"
                          : r.growthCagr5yPct != null
                            ? "text-[var(--red)]"
                            : ""
                      }`}
                    >
                      {r.growthCagr5yPct != null
                        ? `${r.growthCagr5yPct > 0 ? "+" : ""}${fmtPercent(r.growthCagr5yPct, dateLocale)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right num text-xs">
                      {r.streakYears > 0 ? `${r.streakYears}${t("streakSuffix")}` : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right num text-xs ${
                        r.payoutRatioPct != null && r.payoutRatioPct > 90
                          ? "text-[var(--red)]"
                          : r.payoutRatioPct != null && r.payoutRatioPct > 70
                            ? "text-yellow-400"
                            : ""
                      }`}
                    >
                      {r.payoutRatioPct != null
                        ? fmtPercent(r.payoutRatioPct, dateLocale)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right num text-xs">
                      {r.peRatio != null ? fmtNumber(r.peRatio, dateLocale, 1) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <PayoutFrequencyBadge
                        frequency={r.payoutFrequency}
                        payoutsPerYear={r.payoutsPerYear}
                      />
                    </td>
                    <td className="px-3 py-2 text-right num text-xs">
                      {mcBase != null
                        ? fmtMarketCap(mcBase, base)
                        : r.marketCap != null
                          ? fmtMarketCap(r.marketCap, r.currency)
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-right num text-xs">
                      {rateBase != null && r.currency.toUpperCase() !== base ? (
                        <>
                          <div>{fmtCurrency(rateBase, base, dateLocale)}</div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {r.dividendRate != null
                              ? fmtCurrency(r.dividendRate, r.currency, dateLocale)
                              : ""}
                          </div>
                        </>
                      ) : r.dividendRate != null ? (
                        fmtCurrency(r.dividendRate, r.currency, dateLocale)
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-[var(--muted)]">
        {t("scoreNote")}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RangeInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1">
        {label}:{" "}
        <span className="text-[var(--foreground)] num">
          {value}
          {suffix}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function fmtMarketCap(value: number, currency: string): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T ${currency}`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B ${currency}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M ${currency}`;
  return fmtCurrency(value, currency);
}
