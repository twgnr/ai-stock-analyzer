"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Rocket, TrendingUp, AlertCircle, Sparkles, Clock } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent, changeClass } from "@/lib/format";
import { WatchlistButton } from "@/components/WatchlistButton";
import { Sparkline } from "@/components/Sparkline";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import {
  saveState,
  loadState,
  clearState,
  formatAge,
  ageHighlightClass,
} from "@/lib/storage";

type Tab = "smallcaps" | "ipos";

interface SmallCapRow {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  changePercent: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  exchange?: string;
}

interface IPORow extends SmallCapRow {
  firstTradeDate?: string;
  daysSinceIPO: number | null;
  position52W: number;
}

interface SignalResult {
  ticker: string;
  name?: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  error?: string;
}

type PresetKey =
  | "aggressive_small_caps"
  | "small_cap_gainers"
  | "undervalued_growth_stocks"
  | "growth_technology_stocks";

const PRESETS: Array<{ value: PresetKey; key: string }> = [
  { value: "aggressive_small_caps", key: "aggressiveSmallCaps" },
  { value: "small_cap_gainers", key: "smallCapGainers" },
  { value: "undervalued_growth_stocks", key: "undervaluedGrowth" },
  { value: "growth_technology_stocks", key: "growthTech" },
];

const MAX_CAP_OPTIONS: Array<{ key: string; value: number | null }> = [
  { key: "all", value: null },
  { key: "micro", value: 300_000_000 },
  { key: "small", value: 1_000_000_000 },
  { key: "smallMid", value: 5_000_000_000 },
];

const IPO_AGE_OPTIONS: Array<{ key: string; value: number }> = [
  { key: "m6", value: 183 },
  { key: "y1", value: 365 },
  { key: "y2", value: 730 },
  { key: "y3", value: 1095 },
];

function fmtMarketCapLocalized(v: number | undefined, locale: string): string {
  if (v == null) return "—";
  // Lokalisierte Suffixe für große Zahlen
  const isDe = locale === "de";
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)} ${isDe ? "Bio." : "T"}`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} ${isDe ? "Mrd." : "B"}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)} ${isDe ? "Mio." : "M"}`;
  return fmtNumber(v, isDe ? "de-DE" : "en-US", 0);
}

export default function DiscoveriesPage() {
  const t = useTranslations("Discoveries");
  const tAge = useTranslations("Format.age");
  const locale = useLocale();
  const localeForNumber = locale === "de" ? "de-DE" : "en-US";
  const [tab, setTab] = useState<Tab>("smallcaps");

  const [preset, setPreset] = useState<PresetKey>("aggressive_small_caps");
  const [maxMarketCap, setMaxMarketCap] = useState<number | null>(null);
  const [scResults, setScResults] = useState<SmallCapRow[]>([]);
  const [scLoading, setScLoading] = useState(false);
  const [scError, setScError] = useState<string | null>(null);
  const [scLastAt, setScLastAt] = useState<number | null>(null);
  const [scSparklines, setScSparklines] = useState<Record<string, number[]>>({});

  const [maxDaysOld, setMaxDaysOld] = useState<number>(730);
  const [ipoResults, setIpoResults] = useState<IPORow[]>([]);
  const [ipoLoading, setIpoLoading] = useState(false);
  const [ipoError, setIpoError] = useState<string | null>(null);
  const [ipoLastAt, setIpoLastAt] = useState<number | null>(null);
  const [ipoSparklines, setIpoSparklines] = useState<Record<string, number[]>>({});

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [signals, setSignals] = useState<SignalResult[] | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadState<{
      tab: Tab;
      preset: PresetKey;
      maxMarketCap: number | null;
      maxDaysOld: number;
      scResults: SmallCapRow[];
      ipoResults: IPORow[];
      scSparklines: Record<string, number[]>;
      ipoSparklines: Record<string, number[]>;
      scLastAt: number | null;
      ipoLastAt: number | null;
      signals: SignalResult[] | null;
    }>("discoveries");
    if (saved) {
      if (saved.tab) setTab(saved.tab);
      if (saved.preset) setPreset(saved.preset);
      if (saved.maxMarketCap !== undefined) setMaxMarketCap(saved.maxMarketCap);
      if (saved.maxDaysOld) setMaxDaysOld(saved.maxDaysOld);
      if (Array.isArray(saved.scResults)) setScResults(saved.scResults);
      if (Array.isArray(saved.ipoResults)) setIpoResults(saved.ipoResults);
      if (saved.scSparklines) setScSparklines(saved.scSparklines);
      if (saved.ipoSparklines) setIpoSparklines(saved.ipoSparklines);
      setScLastAt(saved.scLastAt ?? null);
      setIpoLastAt(saved.ipoLastAt ?? null);
      if (saved.signals) setSignals(saved.signals);
    }
  }, []);

  function persist(patch: Partial<{
    tab: Tab;
    preset: PresetKey;
    maxMarketCap: number | null;
    maxDaysOld: number;
    scResults: SmallCapRow[];
    ipoResults: IPORow[];
    scSparklines: Record<string, number[]>;
    ipoSparklines: Record<string, number[]>;
    scLastAt: number | null;
    ipoLastAt: number | null;
    signals: SignalResult[] | null;
  }>) {
    saveState("discoveries", {
      tab,
      preset,
      maxMarketCap,
      maxDaysOld,
      scResults,
      ipoResults,
      scSparklines,
      ipoSparklines,
      scLastAt,
      ipoLastAt,
      signals,
      ...patch,
    });
  }

  async function loadSparklines(tickers: string[]): Promise<Record<string, number[]>> {
    if (tickers.length === 0) return {};
    try {
      const res = await fetch("/api/stocks/sparklines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickers.slice(0, 30) }),
      });
      return await res.json();
    } catch {
      return {};
    }
  }

  async function runSmallCaps() {
    setScLoading(true);
    setScError(null);
    try {
      const res = await fetch("/api/discoveries/smallcaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset, maxMarketCap: maxMarketCap ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      const rows = data.results as SmallCapRow[];
      const now = Date.now();
      setScResults(rows);
      setScLastAt(now);
      persist({ scResults: rows, scLastAt: now, preset, maxMarketCap });

      const sparks = await loadSparklines(rows.slice(0, 25).map((r) => r.ticker));
      setScSparklines(sparks);
      persist({ scSparklines: sparks });
    } catch (e) {
      setScError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setScLoading(false);
    }
  }

  async function runIPOs() {
    setIpoLoading(true);
    setIpoError(null);
    try {
      const res = await fetch("/api/discoveries/ipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDaysOld }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      const rows = data.results as IPORow[];
      const now = Date.now();
      setIpoResults(rows);
      setIpoLastAt(now);
      persist({ ipoResults: rows, ipoLastAt: now, maxDaysOld });

      const sparks = await loadSparklines(rows.slice(0, 25).map((r) => r.ticker));
      setIpoSparklines(sparks);
      persist({ ipoSparklines: sparks });
    } catch (e) {
      setIpoError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setIpoLoading(false);
    }
  }

  const activeResults: Array<SmallCapRow | IPORow> = tab === "smallcaps" ? scResults : ipoResults;
  const activeSparklines = tab === "smallcaps" ? scSparklines : ipoSparklines;
  const activeLastAt = tab === "smallcaps" ? scLastAt : ipoLastAt;

  function toggleSelect(ticker: string) {
    const next = new Set(selected);
    if (next.has(ticker)) next.delete(ticker);
    else if (next.size < 10) next.add(ticker);
    setSelected(next);
  }

  function selectAllVisible() {
    setSelected(new Set(activeResults.slice(0, 10).map((r) => r.ticker)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runSignalScan() {
    if (activeResults.length === 0) return;
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const tickers =
        selected.size > 0
          ? Array.from(selected).slice(0, 10)
          : activeResults.slice(0, 5).map((r) => r.ticker);
      const res = await fetch("/api/screener/analyze-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      setSignals(data.results);
      persist({ signals: data.results });
    } catch (e) {
      setSignalsError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSignalsLoading(false);
    }
  }

  function resetTab() {
    if (tab === "smallcaps") {
      setScResults([]);
      setScSparklines({});
      setScLastAt(null);
    } else {
      setIpoResults([]);
      setIpoSparklines({});
      setIpoLastAt(null);
    }
    setSignals(null);
    clearState("discoveries");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Rocket className="text-[var(--accent)]" size={24} />
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {t("description")}
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        <button
          onClick={() => {
            setTab("smallcaps");
            setSelected(new Set());
            persist({ tab: "smallcaps" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "smallcaps"
              ? "border-[var(--accent)] text-white"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          {t("tabs.smallcaps")}
        </button>
        <button
          onClick={() => {
            setTab("ipos");
            setSelected(new Set());
            persist({ tab: "ipos" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "ipos"
              ? "border-[var(--accent)] text-white"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          {t("tabs.ipos")}
        </button>
      </div>

      {tab === "smallcaps" ? (
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("presets.label")}</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    preset === p.value
                      ? "border-[var(--accent)] bg-blue-500/10 text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  }`}
                  title={t(`presets.${p.key}.description` as `presets.${typeof p.key}.description`)}
                >
                  {t(`presets.${p.key}.label` as `presets.${typeof p.key}.label`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("maxMarketCap")}</label>
            <div className="flex flex-wrap gap-2">
              {MAX_CAP_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setMaxMarketCap(o.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    maxMarketCap === o.value
                      ? "border-[var(--accent)] bg-blue-500/10 text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {t(`maxCapOptions.${o.key}` as `maxCapOptions.${typeof o.key}`)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={runSmallCaps} disabled={scLoading} className="btn btn-primary">
            {scLoading ? <div className="spinner" /> : <TrendingUp size={14} />}
            {scLoading ? t("loading") : t("loadSmallCaps")}
          </button>
        </div>
      ) : (
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("ipoAge")}
            </label>
            <div className="flex flex-wrap gap-2">
              {IPO_AGE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setMaxDaysOld(o.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    maxDaysOld === o.value
                      ? "border-[var(--accent)] bg-blue-500/10 text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {t(`ipoAgeOptions.${o.key}` as `ipoAgeOptions.${typeof o.key}`)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={runIPOs} disabled={ipoLoading} className="btn btn-primary">
            {ipoLoading ? <div className="spinner" /> : <Rocket size={14} />}
            {ipoLoading ? t("loading") : t("loadIpos")}
          </button>
          <p className="text-xs text-[var(--muted)]">
            {t("ipoNote")}
          </p>
        </div>
      )}

      {(tab === "smallcaps" ? scError : ipoError) && (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} /> {tab === "smallcaps" ? scError : ipoError}
        </div>
      )}

      {activeResults.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-[var(--muted)] flex items-center gap-3 flex-wrap">
            <span>{t("stocksCount", { count: activeResults.length })}</span>
            {activeLastAt && (
              <span
                className={`flex items-center gap-1 text-xs ${ageHighlightClass(activeLastAt)}`}
              >
                <Clock size={12} />
                {(() => {
                  const a = formatAge(activeLastAt);
                  return tAge(a.key, a.values);
                })()}
                <button
                  onClick={resetTab}
                  className="ml-1 text-[var(--muted)] hover:text-[var(--red)] underline underline-offset-2"
                  title={t("discardSaved")}
                >
                  {t("discard")}
                </button>
                {/* discardSaved bleibt nur als title-Hover */}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {selected.size > 0 && (
              <button onClick={clearSelection} className="btn text-xs">
                {t("clearSelection")}
              </button>
            )}
            <button onClick={runSignalScan} disabled={signalsLoading} className="btn btn-primary">
              {signalsLoading ? <div className="spinner" /> : <Sparkles size={14} />}
              {signalsLoading
                ? t("aiAnalyzing")
                : selected.size > 0
                ? t("analyzeSelection", { count: selected.size })
                : t("analyzeTop5")}
            </button>
          </div>
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
            {t("aiHeading")}
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
                        {t("confidence", { pct: Math.round(s.confidence * 100) })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeResults.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      activeResults.length > 0 &&
                      activeResults.slice(0, 10).every((r) => selected.has(r.ticker))
                    }
                    onChange={(e) => (e.target.checked ? selectAllVisible() : clearSelection())}
                    className="accent-[var(--accent)] cursor-pointer"
                  />
                </th>
                <th className="text-left font-medium px-3 py-3">{t("table.ticker")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.price")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.today")}</th>
                <th className="text-left font-medium px-3 py-3">{t("table.threeMonths")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.marketCap")}</th>
                {tab === "ipos" && (
                  <th className="text-right font-medium px-3 py-3">{t("table.ipo")}</th>
                )}
                <th className="text-right font-medium px-3 py-3">{t("table.pos52w")}</th>
                <th className="text-right font-medium px-3 py-3">{t("table.volume")}</th>
                <th className="w-40"></th>
              </tr>
            </thead>
            <tbody>
              {activeResults.map((r) => {
                const ipo = tab === "ipos" ? (r as IPORow) : null;
                const pos52W =
                  r.fiftyTwoWeekHigh && r.fiftyTwoWeekLow && r.fiftyTwoWeekHigh > r.fiftyTwoWeekLow
                    ? ((r.price - r.fiftyTwoWeekLow) / (r.fiftyTwoWeekHigh - r.fiftyTwoWeekLow)) * 100
                    : 50;
                return (
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
                        <div className="font-semibold">{r.ticker}</div>
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
                      {activeSparklines[r.ticker] ? (
                        <Sparkline data={activeSparklines[r.ticker]} width={100} height={26} />
                      ) : (
                        <div className="w-[100px] h-[26px] opacity-20 text-[10px] text-[var(--muted)] flex items-center">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right num">{fmtMarketCapLocalized(r.marketCap, locale)}</td>
                    {tab === "ipos" && ipo && (
                      <td className="px-3 py-3 text-right num text-xs">
                        {ipo.firstTradeDate
                          ? new Date(ipo.firstTradeDate).toLocaleDateString(localeForNumber, {
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                        {ipo.daysSinceIPO != null && (
                          <div className="text-[var(--muted)] opacity-60">
                            {t("ipoAgo", { days: ipo.daysSinceIPO })}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right num">
                      <span
                        className={
                          pos52W < 30
                            ? "text-[var(--red)]"
                            : pos52W > 80
                            ? "text-[var(--green)]"
                            : ""
                        }
                      >
                        {fmtNumber(pos52W, localeForNumber, 0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right num text-xs text-[var(--muted)]">
                      {r.volume ? fmtMarketCapLocalized(r.volume, locale) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <WatchlistButton ticker={r.ticker} name={r.name} size="sm" />
                        <Link
                          href={`/analysis/${encodeURIComponent(r.ticker)}`}
                          className="btn text-xs px-2 py-1"
                        >
                          <Sparkles size={12} />
                          {t("analysis")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeResults.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {t("riskFooter")}
        </p>
      )}
    </div>
  );
}
