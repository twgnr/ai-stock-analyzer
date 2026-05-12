"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  RefreshCw,
  Briefcase,
  Sparkles,
  AlertCircle,
  Settings2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  RotateCcw,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PortfolioTable, type EnrichedPosition } from "@/components/PortfolioTable";
import { PerformanceChart } from "@/components/PerformanceChart";
import { MarketMoversWidget } from "@/components/MarketMoversWidget";
import { PortfolioHealthCard } from "@/components/PortfolioHealthCard";
import { SentimentCommoditiesWidget } from "@/components/SentimentCommoditiesWidget";
import { SectorHeatmapWidget } from "@/components/SectorHeatmapWidget";
import { FavoritesWidget } from "@/components/FavoritesWidget";
import {
  FAVORITES_CHANGED_EVENT,
  type FavoritesChangedDetail,
} from "@/components/FavoriteToggle";
import { enrichPortfolio } from "@/lib/enrichPortfolio";
import { fmtCurrency, fmtPercent, changeClass } from "@/lib/format";
import { isWithinExtendedTradingWindow } from "@/lib/tradingHours";

// Auto-Refresh-Frequenz für Kursdaten. Server-seitig werden Quotes 15 min
// gecacht und das Auto-Update hält sie warm — kurzes Browser-Intervall
// trifft fast immer den Cache, kostet praktisch nichts und fühlt sich
// trotzdem live an. Außerhalb der erweiterten Handelszeiten (Mo–Fr 09:00–
// 23:00 MEZ) wird gar nicht refresht — die Kurse bewegen sich da nicht.
const AUTO_REFRESH_MS = 60 * 1000;

type WidgetId =
  | "favorites"
  | "stats"
  | "performance"
  | "health"
  | "movers"
  | "sentiment"
  | "sectorHeatmap"
  | "positions"
  | "aiAnalysis";

interface WidgetMeta {
  id: WidgetId;
  // Translation-Keys in messages.Dashboard.widgets — werden über
  // useTranslations zur Renderzeit aufgelöst.
  labelKey: string;
  descriptionKey: string;
}

const WIDGET_CATALOG: WidgetMeta[] = [
  { id: "favorites", labelKey: "favorites", descriptionKey: "favoritesDescription" },
  { id: "stats", labelKey: "stats", descriptionKey: "statsDescription" },
  { id: "performance", labelKey: "performance", descriptionKey: "performanceDescription" },
  { id: "health", labelKey: "health", descriptionKey: "healthDescription" },
  { id: "movers", labelKey: "movers", descriptionKey: "moversDescription" },
  { id: "sentiment", labelKey: "sentiment", descriptionKey: "sentimentDescription" },
  { id: "sectorHeatmap", labelKey: "sectorHeatmap", descriptionKey: "sectorHeatmapDescription" },
  { id: "positions", labelKey: "positions", descriptionKey: "positionsDescription" },
  { id: "aiAnalysis", labelKey: "aiAnalysis", descriptionKey: "aiAnalysisDescription" },
];

interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
}

// Alter localStorage-Key. Wird beim ersten Login nach dem Deploy in die DB
// migriert und dann gelöscht.
const LEGACY_LOCAL_STORAGE_KEY = "ai-stock-analyzer:dashboard:widgets:v1";

function defaultLayout(): WidgetConfig[] {
  return WIDGET_CATALOG.map((w) => ({ id: w.id, visible: true }));
}

// Bekannte IDs in gespeicherter Reihenfolge, neu im Katalog hinzugekommene
// Widgets hinten dran.
function reconcileLayout(stored: { id: string; visible: boolean }[]): WidgetConfig[] {
  const known = new Set<WidgetId>(WIDGET_CATALOG.map((w) => w.id));
  const seen = new Set<WidgetId>();
  const out: WidgetConfig[] = [];
  for (const w of stored) {
    if (!known.has(w.id as WidgetId) || seen.has(w.id as WidgetId)) continue;
    seen.add(w.id as WidgetId);
    out.push({ id: w.id as WidgetId, visible: w.visible !== false });
  }
  for (const meta of WIDGET_CATALOG) {
    if (!seen.has(meta.id)) out.push({ id: meta.id, visible: true });
  }
  return out;
}

function readLegacyLocalLayout(): WidgetConfig[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned: { id: string; visible: boolean }[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string"
      ) {
        const w = item as { id: string; visible?: unknown };
        cleaned.push({ id: w.id, visible: w.visible !== false });
      }
    }
    return cleaned.length ? reconcileLayout(cleaned) : null;
  } catch {
    return null;
  }
}

function clearLegacyLocalLayout() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  } catch {}
}

async function persistLayout(layout: WidgetConfig[]) {
  try {
    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardWidgets: layout }),
    });
  } catch {
    // Offline o.ä. - lokaler State bleibt, nächster Save versucht es erneut.
  }
}

export default function Dashboard() {
  const t = useTranslations("Dashboard");
  const tWidgets = useTranslations("Dashboard.widgets");
  const tAi = useTranslations("Dashboard.ai");
  const locale = useLocale();
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<null | {
    summary: string;
    diversification: string;
    concentrationRisks: string[];
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    riskLevel: string;
  }>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [layout, setLayout] = useState<WidgetConfig[]>(() => defaultLayout());
  const [customizing, setCustomizing] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    // Server-Preferences laden, fallback auf Legacy-localStorage falls leer.
    let aborted = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (aborted) return;
        const stored: { id: string; visible: boolean }[] = Array.isArray(
          data?.dashboardWidgets
        )
          ? data.dashboardWidgets
          : [];
        const favs: string[] = Array.isArray(data?.favoriteSections)
          ? data.favoriteSections
          : [];
        setFavorites(favs);

        if (stored.length === 0) {
          const legacy = readLegacyLocalLayout();
          if (legacy && legacy.length) {
            setLayout(legacy);
            await persistLayout(legacy);
            clearLegacyLocalLayout();
            return;
          }
          setLayout(defaultLayout());
          return;
        }
        setLayout(reconcileLayout(stored));
      })
      .catch(() => {
        if (!aborted) setLayout(defaultLayout());
      });
    return () => {
      aborted = true;
    };
  }, []);

  // Stern-Toggle aus den Breadcrumbs hier mitbekommen, ohne Reload.
  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<FavoritesChangedDetail>;
      if (Array.isArray(ce.detail?.favoriteSections)) {
        setFavorites(ce.detail.favoriteSections);
      }
    }
    window.addEventListener(FAVORITES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onChange);
  }, []);

  function moveWidget(idx: number, dir: -1 | 1) {
    setLayout((prev) => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      void persistLayout(next);
      return next;
    });
  }

  function toggleVisible(id: WidgetId) {
    setLayout((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
      void persistLayout(next);
      return next;
    });
  }

  function resetLayout() {
    const fresh = defaultLayout();
    setLayout(fresh);
    void persistLayout(fresh);
  }

  const widgetMeta = useMemo(() => {
    const map = new Map<WidgetId, WidgetMeta>();
    for (const w of WIDGET_CATALOG) map.set(w.id, w);
    return map;
  }, []);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      if (!silent) setError(null);
      const rRes = await fetch("/api/portfolio");
      if (rRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const raw = await rRes.json();
      if (!Array.isArray(raw)) {
        if (!silent) setError(raw.error || t("errorPortfolioApi"));
        return;
      }
      if (raw.length === 0) {
        setPositions([]);
        setUpdated(new Date());
        return;
      }
      const tickers = raw.map((p) => p.ticker).join(",");
      const qRes = await fetch(`/api/stocks/quote?tickers=${encodeURIComponent(tickers)}`);
      const quotes = await qRes.json();
      const currencies = [
        ...new Set<string>(
          quotes.map((q: { currency: string }) => q.currency).concat(raw.map((p) => p.currency))
        ),
      ];
      const fxRes = await fetch(`/api/fx?currencies=${encodeURIComponent(currencies.join(","))}`);
      const fxData = (await fxRes.json()) as { base: string; rates: Record<string, number> };
      setPositions(enrichPortfolio(raw, quotes, fxData.rates || {}, fxData.base || "EUR"));
      setUpdated(new Date());
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      if (!silent) setRefreshing(false);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();

    // Auto-Refresh innerhalb der erweiterten Handelszeiten (Mo–Fr 09:00–23:00
    // MEZ), nur wenn Tab sichtbar. Server-Cache + Auto-Update fängt die
    // tatsächlichen Yahoo-Calls ab.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    }, AUTO_REFRESH_MS);
    // Sofort-Refresh, wenn der Tab nach längerer Pause wieder sichtbar wird.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function analyzePortfolio() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze/portfolio", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tAi("fail"));
      setPortfolioAnalysis(data);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : tAi("fail"));
    } finally {
      setAnalyzing(false);
    }
  }

  const baseCurrency = positions[0]?.baseCurrency || "EUR";
  const totalValue = positions.reduce((s, p) => s + p.marketValueBase, 0);
  const totalCost = positions.reduce((s, p) => s + p.costBasisBase, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost ? (totalPL / totalCost) * 100 : 0;
  const todayChange = positions.reduce((s, p) => s + p.todayChangeBase, 0);
  const todayChangePct = totalValue ? (todayChange / (totalValue - todayChange)) * 100 : 0;
  const missingFxRates = positions
    .filter((p) => p.tradingRate <= 0 || p.purchaseRate <= 0)
    .map((p) => (p.tradingRate <= 0 ? p.tradingCurrency : p.purchaseCurrency));

  const localeForTime = locale === "de" ? "de-DE" : "en-US";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-[var(--muted)]">
            {updated
              ? t("lastUpdate", { time: updated.toLocaleTimeString(localeForTime) })
              : t("loading")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCustomizing((c) => !c)}
            className={`btn ${customizing ? "btn-primary" : ""}`}
            aria-pressed={customizing}
          >
            {customizing ? <Check size={14} /> : <Settings2 size={14} />}
            {customizing ? tWidgets("done") : tWidgets("configure")}
          </button>
          <button onClick={() => load()} disabled={refreshing} className="btn">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
          <Link href="/portfolio" className="btn btn-primary">
            <Briefcase size={14} />
            {t("managePortfolio")}
          </Link>
        </div>
      </div>

      {customizing && (
        <div className="card p-4 space-y-3 border-[var(--accent)]/30 bg-[var(--accent)]/5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              <strong>{tWidgets("customizeTitle")}</strong>{" "}
              <span className="text-[var(--muted)]">{tWidgets("customizeBody")}</span>
            </div>
            <button onClick={resetLayout} className="btn text-xs">
              <RotateCcw size={12} /> {tWidgets("reset")}
            </button>
          </div>
          <ul className="space-y-1.5">
            {layout.map((cfg, i) => {
              const meta = widgetMeta.get(cfg.id);
              if (!meta) return null;
              const label = tWidgets(meta.labelKey as Parameters<typeof tWidgets>[0]);
              const description = tWidgets(meta.descriptionKey as Parameters<typeof tWidgets>[0]);
              return (
                <li
                  key={cfg.id}
                  className={`flex items-center gap-2 px-2 py-2 rounded border border-[var(--border)] ${
                    cfg.visible ? "bg-[var(--surface)]" : "bg-[var(--surface-2)] opacity-60"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveWidget(i, -1)}
                      disabled={i === 0}
                      className="p-0.5 text-[var(--muted)] hover:text-white disabled:opacity-30 disabled:hover:text-[var(--muted)]"
                      aria-label={tWidgets("moveUp")}
                      title={tWidgets("moveUp")}
                    >
                      <ChevronUp size={12} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => moveWidget(i, 1)}
                      disabled={i === layout.length - 1}
                      className="p-0.5 text-[var(--muted)] hover:text-white disabled:opacity-30 disabled:hover:text-[var(--muted)]"
                      aria-label={tWidgets("moveDown")}
                      title={tWidgets("moveDown")}
                    >
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-[var(--muted)] truncate">{description}</div>
                  </div>
                  <button
                    onClick={() => toggleVisible(cfg.id)}
                    className="p-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label={cfg.visible ? tWidgets("hide") : tWidgets("show")}
                    title={cfg.visible ? tWidgets("hide") : tWidgets("show")}
                  >
                    {cfg.visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          <div>{t("loadingPortfolio")}</div>
        </div>
      ) : error ? (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : positions.length === 0 ? (
        <>
          {layout.find((w) => w.id === "favorites" && w.visible) && (
            <FavoritesWidget initialFavorites={favorites} onChange={setFavorites} />
          )}
          <div className="card p-8 text-center">
            <p className="text-[var(--muted)] mb-4">{t("noPositions")}</p>
            <Link href="/portfolio" className="btn btn-primary inline-flex">
              {t("noPositionsCta")}
            </Link>
          </div>
          <MarketMoversWidget />
        </>
      ) : (
        <>
          {missingFxRates.length > 0 && (
            <div className="card p-3 text-xs text-yellow-400 bg-yellow-500/10 border-yellow-500/20">
              {t("missingFx", { currencies: [...new Set(missingFxRates)].join(", ") })}
            </div>
          )}
          {layout
            .filter((w) => w.visible)
            .map((w) => {
              switch (w.id) {
                case "favorites":
                  return (
                    <FavoritesWidget
                      key={w.id}
                      initialFavorites={favorites}
                      onChange={setFavorites}
                    />
                  );
                case "stats":
                  return (
                    <div key={w.id} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard
                        label={t("stats.value")}
                        value={fmtCurrency(totalValue, baseCurrency)}
                      />
                      <StatCard
                        label={t("stats.invested")}
                        value={fmtCurrency(totalCost, baseCurrency)}
                        muted
                      />
                      <StatCard
                        label={t("stats.pnl")}
                        value={fmtCurrency(totalPL, baseCurrency)}
                        subValue={fmtPercent(totalPLPct)}
                        colorClass={changeClass(totalPL)}
                      />
                      <StatCard
                        label={t("stats.today")}
                        value={fmtCurrency(todayChange, baseCurrency)}
                        subValue={fmtPercent(todayChangePct)}
                        colorClass={changeClass(todayChange)}
                      />
                    </div>
                  );
                case "performance":
                  return <PerformanceChart key={w.id} days={180} />;
                case "health":
                  return <PortfolioHealthCard key={w.id} />;
                case "movers":
                  return <MarketMoversWidget key={w.id} />;
                case "sentiment":
                  return <SentimentCommoditiesWidget key={w.id} />;
                case "sectorHeatmap":
                  return <SectorHeatmapWidget key={w.id} />;
                case "positions":
                  return (
                    <div key={w.id}>
                      <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                        {tWidgets("positions")}
                      </h2>
                      <PortfolioTable positions={positions} />
                    </div>
                  );
                case "aiAnalysis":
                  return (
                    <div key={w.id} className="card p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles size={16} className="text-[var(--accent)]" />
                          <h2 className="font-semibold">{tAi("title")}</h2>
                        </div>
                        <button onClick={analyzePortfolio} disabled={analyzing} className="btn btn-primary">
                          {analyzing ? <div className="spinner" /> : <Sparkles size={14} />}
                          {analyzing ? tAi("analyzing") : tAi("analyze")}
                        </button>
                      </div>
                      {analyzeError && (
                        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                          {analyzeError}
                        </div>
                      )}
                      {portfolioAnalysis && (
                        <div className="space-y-4 pt-2 border-t border-[var(--border)]">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-1">
                              <span>{tAi("risk")}</span>
                              <span
                                className={
                                  portfolioAnalysis.riskLevel === "HIGH"
                                    ? "text-[var(--red)]"
                                    : portfolioAnalysis.riskLevel === "LOW"
                                    ? "text-[var(--green)]"
                                    : "text-yellow-400"
                                }
                              >
                                {portfolioAnalysis.riskLevel}
                              </span>
                            </div>
                            <p className="text-sm">{portfolioAnalysis.summary}</p>
                          </div>
                          <Section title={tAi("diversification")} text={portfolioAnalysis.diversification} />
                          {portfolioAnalysis.concentrationRisks?.length > 0 && (
                            <ListSection
                              title={tAi("concentration")}
                              items={portfolioAnalysis.concentrationRisks}
                              color="text-[var(--red)]"
                            />
                          )}
                          <div className="grid md:grid-cols-2 gap-4">
                            {portfolioAnalysis.strengths?.length > 0 && (
                              <ListSection
                                title={tAi("strengths")}
                                items={portfolioAnalysis.strengths}
                                color="text-[var(--green)]"
                              />
                            )}
                            {portfolioAnalysis.weaknesses?.length > 0 && (
                              <ListSection
                                title={tAi("weaknesses")}
                                items={portfolioAnalysis.weaknesses}
                                color="text-yellow-400"
                              />
                            )}
                          </div>
                          {portfolioAnalysis.suggestions?.length > 0 && (
                            <ListSection title={tAi("suggestions")} items={portfolioAnalysis.suggestions} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                default:
                  return null;
              }
            })}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  colorClass,
  muted,
}: {
  label: string;
  value: string;
  subValue?: string;
  colorClass?: string;
  muted?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold num ${muted ? "text-[var(--muted)]" : colorClass || ""}`}>
        {value}
      </div>
      {subValue && <div className={`text-sm num ${colorClass || ""}`}>{subValue}</div>}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{title}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function ListSection({ title, items, color }: { title: string; items: string[]; color?: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{title}</div>
      <ul className="text-sm space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={color || "text-[var(--accent)]"}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
