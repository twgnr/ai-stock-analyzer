"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  getRecentTickers,
  subscribeRecentTickers,
  type RecentTicker,
} from "@/lib/recentTickers";
import {
  Search,
  LayoutDashboard,
  Briefcase,
  Bell,
  Eye,
  Filter,
  Zap,
  Rocket,
  GitCompare,
  Radar,
  BookOpen,
  Newspaper as NewspaperIcon,
  Scale,
  Activity,
  FileText,
  Receipt,
  Coins,
  CalendarDays,
  MessageCircle,
  Compass,
  Shield,
  Settings,
  GitBranch,
  BarChart3,
  Users,
  Download,
  History,
  Plus,
  Clock,
} from "lucide-react";

type CommandGroup = "recent" | "pages" | "actions" | "tickers";

interface Command {
  id: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
  group: CommandGroup;
}

interface TickerHit {
  ticker: string;
  name?: string;
  exchange?: string;
}

/** Stable Server-Snapshot — sonst löst useSyncExternalStore Endlos-Renders aus. */
const EMPTY_RECENT_TICKERS: RecentTicker[] = [];
function getEmptyRecentTickers(): RecentTicker[] {
  return EMPTY_RECENT_TICKERS;
}

function scoreMatch(query: string, text: string, keywords: string[]): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900;
  if (t.includes(q)) return 500;
  // Fuzzy: query-Buchstaben in Reihenfolge vorhanden?
  let idx = 0;
  for (const ch of q) {
    idx = t.indexOf(ch, idx);
    if (idx === -1) break;
    idx++;
  }
  let base = idx !== -1 ? 200 : 0;
  for (const kw of keywords) {
    if (kw.toLowerCase().includes(q)) base = Math.max(base, 400);
  }
  return base;
}

export function CommandPalette() {
  const t = useTranslations("CommandPalette");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [tickerHits, setTickerHits] = useState<TickerHit[]>([]);
  const [tickerLoading, setTickerLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global-Shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTickerHits([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Ticker-Suche (debounced, ab 2 Zeichen)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setTickerHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setTickerLoading(true);
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setTickerHits([]);
          return;
        }
        const data = await res.json();
        setTickerHits(Array.isArray(data) ? data.slice(0, 6) : []);
      } catch {
        setTickerHits([]);
      } finally {
        setTickerLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const pageCommands: Command[] = useMemo(
    () => [
      { id: "dashboard", label: t("pages.dashboard"), icon: <LayoutDashboard size={14} />, action: () => router.push("/"), keywords: ["home", "overview"], group: "pages" },
      { id: "portfolio", label: t("pages.portfolio"), icon: <Briefcase size={14} />, action: () => router.push("/portfolio"), keywords: ["positionen", "positions"], group: "pages" },
      { id: "watchlist", label: t("pages.watchlist"), icon: <Eye size={14} />, action: () => router.push("/watchlist"), keywords: ["beobachten", "watch"], group: "pages" },
      { id: "insights", label: t("pages.insights"), icon: <Compass size={14} />, action: () => router.push("/insights"), keywords: [], group: "pages" },
      { id: "chat", label: t("pages.chat"), icon: <MessageCircle size={14} />, action: () => router.push("/chat"), keywords: ["frage", "ki", "ask", "ai"], group: "pages" },
      { id: "transactions", label: t("pages.transactions"), icon: <Receipt size={14} />, action: () => router.push("/transactions"), keywords: ["trades"], group: "pages" },
      { id: "dividends", label: t("pages.dividends"), icon: <Coins size={14} />, action: () => router.push("/dividends"), keywords: ["dividend"], group: "pages" },
      { id: "dividend-screener", label: t("pages.dividendScreener"), icon: <Coins size={14} />, action: () => router.push("/dividends/screener"), keywords: ["aristocrats", "screener", "yield", "cagr"], group: "pages" },
      { id: "dividend-calendar", label: t("pages.dividendCalendar"), icon: <Coins size={14} />, action: () => router.push("/dividends-calendar"), keywords: ["ex-dividend"], group: "pages" },
      { id: "calendar", label: t("pages.calendar"), icon: <CalendarDays size={14} />, action: () => router.push("/calendar"), keywords: ["termine", "earnings"], group: "pages" },
      { id: "alerts", label: t("pages.alerts"), icon: <Bell size={14} />, action: () => router.push("/alerts"), keywords: [], group: "pages" },
      { id: "alerts-history", label: t("pages.alertsHistory"), icon: <History size={14} />, action: () => router.push("/alerts/history"), keywords: ["history", "historie"], group: "pages" },
      { id: "screener", label: t("pages.screener"), icon: <Filter size={14} />, action: () => router.push("/screener"), keywords: [], group: "pages" },
      { id: "breakout", label: t("pages.breakout"), icon: <Zap size={14} />, action: () => router.push("/breakout"), keywords: [], group: "pages" },
      { id: "discoveries", label: t("pages.discoveries"), icon: <Rocket size={14} />, action: () => router.push("/discoveries"), keywords: ["entdeckungen"], group: "pages" },
      { id: "peer", label: t("pages.peer"), icon: <GitCompare size={14} />, action: () => router.push("/peer-compare"), keywords: ["compare", "peer"], group: "pages" },
      { id: "market", label: t("pages.market"), icon: <Radar size={14} />, action: () => router.push("/market"), keywords: ["markt", "market"], group: "pages" },
      { id: "magazine", label: t("pages.magazine"), icon: <BookOpen size={14} />, action: () => router.push("/magazine"), keywords: ["pdf", "börse online", "magazine"], group: "pages" },
      { id: "news-digest", label: t("pages.newsDigest"), icon: <NewspaperIcon size={14} />, action: () => router.push("/news-digest"), keywords: ["news"], group: "pages" },
      { id: "rebalance", label: t("pages.rebalance"), icon: <Scale size={14} />, action: () => router.push("/rebalance"), keywords: ["bucket"], group: "pages" },
      { id: "backtest", label: t("pages.backtest"), icon: <Activity size={14} />, action: () => router.push("/backtest"), keywords: ["strategie", "strategy"], group: "pages" },
      { id: "tax-report", label: t("pages.taxReport"), icon: <FileText size={14} />, action: () => router.push("/tax-report"), keywords: ["abgeltungsteuer", "realisierte gewinne", "tax"], group: "pages" },
      { id: "metrics", label: t("pages.metrics"), icon: <BarChart3 size={14} />, action: () => router.push("/portfolio/metrics"), keywords: ["twr", "sharpe", "sortino", "drawdown"], group: "pages" },
      { id: "correlations", label: t("pages.correlations"), icon: <GitBranch size={14} />, action: () => router.push("/portfolio/correlations"), keywords: ["correlation", "beta"], group: "pages" },
      { id: "community-wl", label: t("pages.communityWl"), icon: <Users size={14} />, action: () => router.push("/watchlist/community"), keywords: ["sharing"], group: "pages" },
      { id: "broker-import", label: t("pages.brokerImport"), icon: <Download size={14} />, action: () => router.push("/portfolio/import"), keywords: ["comdirect", "trade republic", "ibkr"], group: "pages" },
      { id: "portfolio-report", label: t("pages.portfolioReport"), icon: <FileText size={14} />, action: () => router.push("/portfolio/report"), keywords: ["drucken", "pdf", "print"], group: "pages" },
      { id: "settings", label: t("pages.settings"), icon: <Settings size={14} />, action: () => router.push("/settings"), keywords: ["api key", "2fa"], group: "pages" },
      { id: "admin", label: t("pages.admin"), icon: <Shield size={14} />, action: () => router.push("/admin"), keywords: [], group: "pages" },
    ],
    [router, t]
  );

  const actionCommands: Command[] = useMemo(
    () => [
      {
        id: "new-alert",
        label: t("actions.newAlert"),
        icon: <Plus size={14} />,
        action: () => router.push("/alerts"),
        keywords: ["price", "indicator"],
        group: "actions",
      },
      {
        id: "new-digest",
        label: t("actions.newDigest"),
        icon: <Plus size={14} />,
        action: () => router.push("/news-digest"),
        keywords: ["news", "summary"],
        group: "actions",
      },
      {
        id: "analyze-magazine",
        label: t("actions.analyzeMagazine"),
        icon: <Plus size={14} />,
        action: () => router.push("/magazine"),
        keywords: ["pdf"],
        group: "actions",
      },
      {
        id: "new-backtest",
        label: t("actions.newBacktest"),
        icon: <Plus size={14} />,
        action: () => router.push("/backtest"),
        keywords: ["rsi", "macd"],
        group: "actions",
      },
      {
        id: "import-csv",
        label: t("actions.importCsv"),
        icon: <Plus size={14} />,
        action: () => router.push("/portfolio/import"),
        keywords: ["broker", "comdirect"],
        group: "actions",
      },
    ],
    [router, t]
  );

  const scored = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return [...pageCommands, ...actionCommands];
    }
    const all = [...pageCommands, ...actionCommands];
    return all
      .map((c) => ({
        c,
        score: scoreMatch(q, c.label, c.keywords),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [query, pageCommands, actionCommands]);

  const tickerCommands: Command[] = useMemo(
    () =>
      tickerHits.map((th) => ({
        id: `ticker-${th.ticker}`,
        label: th.ticker,
        sub: th.name,
        icon: <BarChart3 size={14} />,
        action: () => router.push(`/analysis/${encodeURIComponent(th.ticker)}`),
        keywords: [th.name || "", th.exchange || ""],
        group: "tickers" as const,
      })),
    [tickerHits, router]
  );

  // Recently-Viewed-Tickers — beim Öffnen der Palette ohne Query oben anzeigen.
  // getRecentTickers gibt einen referentiell stabilen Wert zurück, solange
  // sich der localStorage-Eintrag nicht geändert hat (siehe lib/recentTickers).
  const recentTickers = useSyncExternalStore<RecentTicker[]>(
    subscribeRecentTickers,
    getRecentTickers,
    getEmptyRecentTickers
  );
  const recentCommands: Command[] = useMemo(
    () =>
      recentTickers.slice(0, 6).map((r) => ({
        id: `recent-${r.ticker}`,
        label: r.ticker,
        sub: r.name,
        icon: <Clock size={14} />,
        action: () => router.push(`/analysis/${encodeURIComponent(r.ticker)}`),
        keywords: [r.name || ""],
        group: "recent" as const,
      })),
    [recentTickers, router]
  );

  const visible = useMemo(() => {
    const q = query.trim();
    // Bei leerer Query: Recents ganz oben, dann Pages/Actions.
    // Bei aktiver Query: Recents überspringen — User sucht gezielt.
    const items = q
      ? [...scored, ...tickerCommands]
      : [...recentCommands, ...scored, ...tickerCommands];
    return items.slice(0, 20);
  }, [scored, tickerCommands, recentCommands, query]);

  useEffect(() => {
    if (active >= visible.length) setActive(Math.max(0, visible.length - 1));
  }, [visible.length, active]);

  function runActive() {
    const item = visible[active];
    if (!item) return;
    item.action();
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(visible.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runActive();
    }
  }

  if (!open) return null;

  const groups: Record<CommandGroup, Command[]> = {
    recent: [],
    pages: [],
    actions: [],
    tickers: [],
  };
  for (const v of visible) {
    groups[v.group].push(v);
  }

  const groupOrder: CommandGroup[] = ["recent", "pages", "actions", "tickers"];

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-[10vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl card overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
          <Search size={16} className="text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {tickerLoading && <div className="spinner" />}
          <kbd className="text-xs text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Search
                size={28}
                className="mx-auto mb-2 text-[var(--muted)] opacity-40"
                aria-hidden="true"
              />
              <div className="text-sm text-[var(--foreground)]">
                {query.trim() ? (
                  t("noResultsForQuery", { query: query.trim() })
                ) : (
                  t("noResults")
                )}
              </div>
              <div className="text-xs text-[var(--muted)] mt-2">
                {t("tryHint")}
              </div>
              {tickerLoading && (
                <div className="text-xs text-[var(--muted)] mt-2 inline-flex items-center gap-1.5">
                  <span className="spinner" /> {t("tickerLoading")}
                </div>
              )}
            </div>
          ) : (
            groupOrder
              .filter((g) => groups[g].length > 0)
              .map((group) => (
                <div key={group}>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider px-3 pt-2 pb-1">
                    {t(`groups.${group}`)}
                  </div>
                  {groups[group].map((item) => {
                    const idx = runningIdx++;
                    const isActive = idx === active;
                    return (
                      <button
                        key={item.id}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => {
                          item.action();
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm ${
                          isActive ? "bg-[var(--surface-2)]" : ""
                        }`}
                      >
                        <span className="text-[var(--muted)] flex-shrink-0">
                          {item.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{item.label}</span>
                          {item.sub && (
                            <span className="block text-xs text-[var(--muted)] truncate">
                              {item.sub}
                            </span>
                          )}
                        </span>
                        {isActive && (
                          <kbd className="text-xs text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5 flex-shrink-0">
                            ↵
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-[var(--border)] text-xs text-[var(--muted)] flex items-center gap-3">
          <span>
            <kbd className="border border-[var(--border)] rounded px-1 py-0.5">↑↓</kbd>{" "}
            {t("hintNavigate")}
          </span>
          <span>
            <kbd className="border border-[var(--border)] rounded px-1 py-0.5">↵</kbd>{" "}
            {t("hintOpen")}
          </span>
          <span>
            <kbd className="border border-[var(--border)] rounded px-1 py-0.5">
              Cmd
            </kbd>
            +
            <kbd className="border border-[var(--border)] rounded px-1 py-0.5">
              K
            </kbd>{" "}
            {t("hintToggle")}
          </span>
        </div>
      </div>
    </div>
  );
}
