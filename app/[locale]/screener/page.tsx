"use client";

import { useEffect, useState, Suspense } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Filter, AlertCircle, Sparkles, Save, Trash2, BookMarked, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtCurrency, fmtNumber, fmtPercent, changeClass } from "@/lib/format";
import { WatchlistButton } from "@/components/WatchlistButton";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { Sparkline } from "@/components/Sparkline";
import {
  saveState,
  loadState,
  clearState,
  formatAge,
  ageHighlightClass,
} from "@/lib/storage";

type Region = "DE" | "EU" | "US" | "AS";
type Preset = "value" | "growth" | "dividend" | "oversold" | "momentum" | null;
type Position52W = "any" | "near_low" | "near_high";

interface ScreenerResult {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  changePercent: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  priceToBook?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  position52W: number;
  region: Region;
  matches: string[];
  exchange?: string;
}

interface SavedScreen {
  _id: string;
  name: string;
  filters: FilterState;
  updatedAt: string;
}

interface FilterState {
  preset: Preset;
  regions: Region[];
  maxPE: string;
  minDivYield: string;
  minMarketCap: string;
  position52W: Position52W;
}

interface SignalResult {
  ticker: string;
  name?: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  risks?: string[];
  opportunities?: string[];
  error?: string;
}

const PRESET_VALUES: Array<{ value: Preset; key: string }> = [
  { value: null, key: "free" },
  { value: "value", key: "value" },
  { value: "growth", key: "growth" },
  { value: "dividend", key: "dividend" },
  { value: "oversold", key: "oversold" },
  { value: "momentum", key: "momentum" },
];

const REGION_VALUES: Region[] = ["DE", "EU", "US", "AS"];

function fmtMarketCap(v: number | undefined, locale: string): string {
  if (v == null) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)} Bio.`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} Mrd.`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)} Mio.`;
  return fmtNumber(v, locale === "de" ? "de-DE" : "en-US", 0);
}

const DEFAULT_FILTERS: FilterState = {
  preset: null,
  regions: ["DE", "EU", "US", "AS"],
  maxPE: "",
  minDivYield: "",
  minMarketCap: "",
  position52W: "any",
};

export default function ScreenerPage() {
  const t = useTranslations("Screener");
  return (
    <Suspense fallback={<div className="text-sm text-[var(--muted)]">{t("loading")}</div>}>
      <ScreenerPageInner />
    </Suspense>
  );
}

function ScreenerPageInner() {
  const t = useTranslations("Screener");
  const tAge = useTranslations("Format.age");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const searchParams = useSearchParams();
  const presetFromUrl = searchParams.get("preset") as Preset;
  const [filters, setFilters] = useState<FilterState>(
    presetFromUrl && ["value", "growth", "dividend", "oversold", "momentum"].includes(presetFromUrl)
      ? { ...DEFAULT_FILTERS, preset: presetFromUrl }
      : DEFAULT_FILTERS
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [meta, setMeta] = useState<{ total: number; matches: number } | null>(null);
  const [sortKey, setSortKey] = useState<keyof ScreenerResult>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalResult[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/screens")
      .then((r) => r.json())
      .then((data) => setSavedScreens(Array.isArray(data) ? data : []))
      .catch(() => {});

    const saved = loadState<{
      filters: FilterState;
      results: ScreenerResult[];
      meta: { total: number; matches: number } | null;
      sparklines: Record<string, number[]>;
      signals: SignalResult[] | null;
    }>("screener");
    if (saved) {
      if (saved.filters) setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
      if (Array.isArray(saved.results)) setResults(saved.results);
      if (saved.meta) setMeta(saved.meta);
      if (saved.sparklines) setSparklines(saved.sparklines);
      if (saved.signals) setSignals(saved.signals);
      setLastScanAt(saved._ts);
    }
  }, []);

  function persistSnapshot(patch: {
    filters?: FilterState;
    results?: ScreenerResult[];
    meta?: { total: number; matches: number } | null;
    sparklines?: Record<string, number[]>;
    signals?: SignalResult[] | null;
  }) {
    const snapshot = {
      filters: patch.filters ?? filters,
      results: patch.results ?? results,
      meta: patch.meta ?? meta,
      sparklines: patch.sparklines ?? sparklines,
      signals: patch.signals ?? signals,
    };
    saveState("screener", snapshot);
    setLastScanAt(Date.now());
  }

  function toggleRegion(r: Region) {
    const next = filters.regions.includes(r)
      ? filters.regions.filter((x) => x !== r)
      : [...filters.regions, r];
    setFilters({ ...filters, regions: next.length === 0 ? [r] : next });
  }

  async function run() {
    setLoading(true);
    setError(null);
    setSignals(null);
    setSparklines({});
    try {
      const body = {
        regions: filters.regions,
        preset: filters.preset,
        maxPE: filters.maxPE ? parseFloat(filters.maxPE.replace(",", ".")) : undefined,
        minDividendYield: filters.minDivYield
          ? parseFloat(filters.minDivYield.replace(",", "."))
          : undefined,
        minMarketCap: filters.minMarketCap
          ? parseFloat(filters.minMarketCap.replace(",", ".")) * 1e9
          : undefined,
        position52W: filters.position52W === "any" ? undefined : filters.position52W,
      };
      const res = await fetch("/api/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("screenerError"));
      const newResults = data.results as ScreenerResult[];
      const newMeta = { total: data.total, matches: data.matches };
      setResults(newResults);
      setMeta(newMeta);
      persistSnapshot({
        filters,
        results: newResults,
        meta: newMeta,
        sparklines: {},
        signals: null,
      });

      const topTickers = newResults.slice(0, 30).map((r) => r.ticker);
      if (topTickers.length > 0) {
        fetch("/api/stocks/sparklines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: topTickers }),
        })
          .then((r) => r.json())
          .then((sd) => {
            const sparks = sd || {};
            setSparklines(sparks);
            persistSnapshot({ sparklines: sparks });
          })
          .catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  async function saveScreen() {
    if (!saveName.trim()) return;
    try {
      const res = await fetch("/api/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), filters }),
      });
      const created = await res.json();
      setSavedScreens([
        created,
        ...savedScreens.filter((s) => s._id !== created._id),
      ]);
      setShowSaveInput(false);
      setSaveName("");
    } catch {}
  }

  async function deleteScreen(id: string) {
    if (!confirm(t("confirmDeleteScreen"))) return;
    await fetch(`/api/screens/${id}`, { method: "DELETE" });
    setSavedScreens(savedScreens.filter((s) => s._id !== id));
  }

  function loadScreen(s: SavedScreen) {
    setFilters({ ...DEFAULT_FILTERS, ...s.filters });
  }

  async function runSignalScan() {
    if (sorted.length === 0) return;
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const tickers =
        selected.size > 0
          ? Array.from(selected).slice(0, 10)
          : sorted.slice(0, 5).map((r) => r.ticker);
      const res = await fetch("/api/screener/analyze-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("signalScanFailed"));
      setSignals(data.results);
      persistSnapshot({ signals: data.results });
    } catch (e) {
      setSignalsError(e instanceof Error ? e.message : t("error"));
    } finally {
      setSignalsLoading(false);
    }
  }

  function resetResults() {
    setResults([]);
    setMeta(null);
    setSparklines({});
    setSignals(null);
    setLastScanAt(null);
    clearState("screener");
  }

  function toggleSelect(ticker: string) {
    const next = new Set(selected);
    if (next.has(ticker)) next.delete(ticker);
    else if (next.size < 10) next.add(ticker);
    setSelected(next);
  }

  function selectAllVisible() {
    setSelected(new Set(sorted.slice(0, 10).map((r) => r.ticker)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function changeSort(key: keyof ScreenerResult) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...results].sort((a, b) => {
    const av = a[sortKey] as number | undefined;
    const bv = b[sortKey] as number | undefined;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("description")}</p>
      </div>

      {savedScreens.length > 0 && (
        <div className="card p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <BookMarked size={14} className="text-[var(--muted)]" />
            <span className="text-[var(--muted)]">{t("savedScreens")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedScreens.map((s) => (
              <div
                key={s._id}
                className="flex items-center gap-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-md overflow-hidden"
              >
                <button
                  onClick={() => loadScreen(s)}
                  className="px-2 py-1 hover:bg-[var(--accent)]/20 transition-colors"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => deleteScreen(s._id)}
                  className="px-1.5 py-1 text-[var(--muted)] hover:text-[var(--red)] border-l border-[var(--border)]"
                  title={t("deleteTitle")}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("preset")}</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_VALUES.map((p) => {
              const label = t(`presets.${p.key}` as `presets.${"free" | "value" | "growth" | "dividend" | "oversold" | "momentum"}`);
              const description = t(
                `presets.${p.key}Description` as `presets.${"free" | "value" | "growth" | "dividend" | "oversold" | "momentum"}Description`
              );
              return (
                <button
                  key={p.key}
                  onClick={() => setFilters({ ...filters, preset: p.value })}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    filters.preset === p.value
                      ? "border-[var(--accent)] bg-blue-500/10 text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  }`}
                  title={description}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("regions")}</label>
          <div className="flex flex-wrap gap-2">
            {REGION_VALUES.map((r) => (
              <button
                key={r}
                onClick={() => toggleRegion(r)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  filters.regions.includes(r)
                    ? "border-[var(--accent)] bg-blue-500/10 text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {t(`regionLabels.${r}` as `regionLabels.${Region}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("maxPE")}</label>
            <input
              type="text"
              inputMode="decimal"
              value={filters.maxPE}
              onChange={(e) => setFilters({ ...filters, maxPE: e.target.value })}
              placeholder={t("maxPEPlaceholder")}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("minDivYield")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={filters.minDivYield}
              onChange={(e) => setFilters({ ...filters, minDivYield: e.target.value })}
              placeholder={t("minDivYieldPlaceholder")}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("minMarketCap")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={filters.minMarketCap}
              onChange={(e) => setFilters({ ...filters, minMarketCap: e.target.value })}
              placeholder={t("minMarketCapPlaceholder")}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("position52W")}</label>
            <select
              value={filters.position52W}
              onChange={(e) =>
                setFilters({ ...filters, position52W: e.target.value as Position52W })
              }
              className="input"
            >
              <option value="any">{t("position52WAny")}</option>
              <option value="near_low">{t("position52WNearLow")}</option>
              <option value="near_high">{t("position52WNearHigh")}</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={run} disabled={loading} className="btn btn-primary">
            {loading ? <div className="spinner" /> : <Filter size={14} />}
            {loading ? t("scanning") : t("start")}
          </button>
          {showSaveInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={t("saveNamePlaceholder")}
                className="input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveScreen();
                  if (e.key === "Escape") setShowSaveInput(false);
                }}
              />
              <button onClick={saveScreen} disabled={!saveName.trim()} className="btn btn-primary">
                <Save size={14} />
                {t("save")}
              </button>
              <button onClick={() => setShowSaveInput(false)} className="btn">
                {t("cancel")}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSaveInput(true)} className="btn">
              <Save size={14} />
              {t("saveScreen")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {meta && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-[var(--muted)] flex items-center gap-3 flex-wrap">
            <span>{t("matchInfo", { matches: meta.matches, total: meta.total })}</span>
            {lastScanAt && (
              <span
                className={`flex items-center gap-1 text-xs ${ageHighlightClass(lastScanAt)}`}
              >
                <Clock size={12} />
                {(() => {
                  const a = formatAge(lastScanAt);
                  return tAge(a.key, a.values);
                })()}
                <button
                  onClick={resetResults}
                  className="ml-1 text-[var(--muted)] hover:text-[var(--red)] underline underline-offset-2"
                  title={t("discardSaved")}
                >
                  {t("discard")}
                </button>
              </span>
            )}
          </div>
          {sorted.length > 0 && (
            <div className="flex gap-2 items-center">
              {selected.size > 0 && (
                <button onClick={clearSelection} className="btn text-xs">
                  {t("clearSelection")}
                </button>
              )}
              <button onClick={runSignalScan} disabled={signalsLoading} className="btn btn-primary">
                {signalsLoading ? <div className="spinner" /> : <Sparkles size={14} />}
                {signalsLoading
                  ? t("analyzing")
                  : selected.size > 0
                  ? t("analyzeSelection", { count: selected.size })
                  : t("analyzeTop5")}
              </button>
            </div>
          )}
        </div>
      )}

      {signalsError && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {signalsError}
        </div>
      )}

      {signals && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
            {t("signalScanTitle")}
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {signals.map((s) => (
              <div key={s.ticker} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/analysis/${encodeURIComponent(s.ticker)}`} className="flex-1">
                    <div className="font-semibold">{s.ticker}</div>
                    <div className="text-xs text-[var(--muted)] truncate">{s.name}</div>
                  </Link>
                  {s.recommendation && <RecommendationBadge recommendation={s.recommendation} />}
                </div>
                {s.error ? (
                  <p className="text-sm text-[var(--red)]">{s.error}</p>
                ) : (
                  <>
                    {s.summary && <p className="text-sm font-medium">{s.summary}</p>}
                    {s.reasoning && (
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{s.reasoning}</p>
                    )}
                    {s.confidence != null && (
                      <div className="text-xs text-[var(--muted)]">
                        {t("confidence")}: {Math.round(s.confidence * 100)}%
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      sorted.length > 0 &&
                      sorted.slice(0, 10).every((r) => selected.has(r.ticker))
                    }
                    onChange={(e) =>
                      e.target.checked ? selectAllVisible() : clearSelection()
                    }
                    className="accent-[var(--accent)] cursor-pointer"
                    title={t("selectTop10Title")}
                  />
                </th>
                <th className="text-left font-medium px-3 py-3">{t("table.ticker")}</th>
                <Th onClick={() => changeSort("price")} active={sortKey === "price"} dir={sortDir}>{t("table.price")}</Th>
                <Th onClick={() => changeSort("changePercent")} active={sortKey === "changePercent"} dir={sortDir}>{t("table.today")}</Th>
                <th className="text-left font-medium px-3 py-3">{t("table.trend3M")}</th>
                <Th onClick={() => changeSort("marketCap")} active={sortKey === "marketCap"} dir={sortDir}>{t("table.marketCap")}</Th>
                <Th onClick={() => changeSort("trailingPE")} active={sortKey === "trailingPE"} dir={sortDir}>{t("table.pe")}</Th>
                <Th onClick={() => changeSort("dividendYield")} active={sortKey === "dividendYield"} dir={sortDir}>{t("table.divYield")}</Th>
                <Th onClick={() => changeSort("position52W")} active={sortKey === "position52W"} dir={sortDir}>{t("table.pos52W")}</Th>
                <th className="text-left font-medium px-3 py-3">{t("table.signals")}</th>
                <th className="w-40"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.ticker}
                  className={`border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] ${
                    selected.has(r.ticker) ? "bg-blue-500/5" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.ticker)}
                      onChange={() => toggleSelect(r.ticker)}
                      disabled={!selected.has(r.ticker) && selected.size >= 10}
                      className="accent-[var(--accent)] cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/analysis/${encodeURIComponent(r.ticker)}`} className="block">
                      <div className="font-semibold flex items-center gap-2">
                        {r.ticker}
                        <span className="text-[10px] text-[var(--muted)] border border-[var(--border)] px-1 rounded">
                          {r.region}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--muted)] truncate max-w-[180px]">
                        {r.name}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtCurrency(r.price, r.currency)}</td>
                  <td className={`px-3 py-3 text-right num ${changeClass(r.changePercent)}`}>
                    {fmtPercent(r.changePercent)}
                  </td>
                  <td className="px-3 py-3">
                    {sparklines[r.ticker] ? (
                      <Sparkline data={sparklines[r.ticker]} width={100} height={26} />
                    ) : (
                      <div className="w-[100px] h-[26px] opacity-20 text-[10px] text-[var(--muted)] flex items-center">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtMarketCap(r.marketCap, locale)}</td>
                  <td className="px-3 py-3 text-right num">
                    {r.trailingPE != null && r.trailingPE > 0
                      ? fmtNumber(r.trailingPE, numberLocale, 1)
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {r.dividendYield != null && r.dividendYield > 0
                      ? fmtNumber(r.dividendYield * 100, numberLocale, 2) + "%"
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    <span
                      className={
                        r.position52W < 30
                          ? "text-[var(--red)]"
                          : r.position52W > 80
                          ? "text-[var(--green)]"
                          : ""
                      }
                    >
                      {fmtNumber(r.position52W, numberLocale, 0)}%
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.matches.map((m, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-end">
                      <WatchlistButton ticker={r.ticker} name={r.name} size="sm" />
                      <Link
                        href={`/analysis/${encodeURIComponent(r.ticker)}`}
                        className="btn text-xs px-2 py-1"
                      >
                        <Sparkles size={12} />
                        {t("table.analysis")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th
      onClick={onClick}
      className={`text-right font-medium px-3 py-3 cursor-pointer select-none ${
        active ? "text-white" : ""
      }`}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
