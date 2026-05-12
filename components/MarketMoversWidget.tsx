"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Play,
  AlertCircle,
  BarChart2,
  Users,
  Clock,
  ChevronDown,
} from "lucide-react";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

interface MoverRow {
  ticker: string;
  name?: string;
  price: number;
  changePct: number;
  currency: string;
  marketCap?: number;
}

interface Snapshot {
  indexKey: string;
  rows: MoverRow[];
  scannedAt: string | null;
  universeSize: number;
  scanDurationMs: number | null;
  scanInProgress: boolean;
}

interface Payload {
  indexKey: string;
  label: string;
  shared: boolean;
  snapshot: Snapshot;
}

const INDEX_OPTIONS: Array<{ key: string; label: string; group: string }> = [
  { key: "dax", label: "DAX 40", group: "Deutschland" },
  { key: "mdax", label: "MDAX 50", group: "Deutschland" },
  { key: "sdax", label: "SDAX", group: "Deutschland" },
  { key: "tecdax", label: "TecDAX 30", group: "Deutschland" },
  { key: "xetra", label: "XETRA (alle deutschen)", group: "Deutschland" },
  { key: "dow", label: "Dow Jones 30", group: "USA" },
  { key: "sp500", label: "S&P 500 (Top 120)", group: "USA" },
  { key: "nasdaq100", label: "Nasdaq 100", group: "USA" },
  { key: "portfolio", label: "Eigenes Portfolio", group: "Eigene" },
  { key: "watchlist", label: "Eigene Watchlist", group: "Eigene" },
];

const TOPN = 10;
const COLLAPSE_KEY = "sa.moversCollapsed.v1";

// Periodisches Re-Fetching des aktuell angezeigten Index:
//   - hält lastViewedAt serverseitig frisch (der Autoscan greift nur auf
//     angeschaute Indizes zu)
//   - holt ein etwaiges Auto-Scan-Update automatisch ins UI
const VIEW_REFRESH_MS = 3 * 60 * 1000;

export function MarketMoversWidget() {
  const [indexKey, setIndexKey] = useState<string>("dax");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  const load = useCallback(async (key: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/movers/${encodeURIComponent(key)}`);
      if (res.status === 401) return;
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (collapsed) return;
    load(indexKey);

    // Periodischer Re-Fetch, solange das Widget aufgeklappt ist. Jeder
    // Request aktualisiert server-seitig lastViewedAt und holt ggf. neue
    // Auto-Scan-Ergebnisse. Bei collapsed wird der Interval gestoppt —
    // dann wird der Index auch nicht mehr automatisch gescannt.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load(indexKey, true);
    }, VIEW_REFRESH_MS);
    return () => clearInterval(id);
  }, [indexKey, load, collapsed]);

  const triggerScan = useCallback(async () => {
    if (!data?.shared) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/movers/${encodeURIComponent(indexKey)}/scan`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load(indexKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan fehlgeschlagen");
    } finally {
      setScanning(false);
    }
  }, [data, indexKey, load]);

  const { topRows, flopRows } = useMemo(() => {
    const rows = data?.snapshot.rows || [];
    return {
      topRows: rows.slice(0, TOPN),
      flopRows: rows.slice(-TOPN).reverse(), // Flop: niedrigste % zuerst
    };
  }, [data]);

  const currentOption = INDEX_OPTIONS.find((o) => o.key === indexKey);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-left hover:text-[var(--accent)]"
          aria-expanded={!collapsed}
          aria-controls="movers-body"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden="true"
          />
          <BarChart2 size={18} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">Top 10 / Flop 10</h2>
        </button>
        {!collapsed && (
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={indexKey}
              onChange={(e) => setIndexKey(e.target.value)}
              className="input w-auto text-sm"
              disabled={loading || scanning}
            >
              {["Deutschland", "USA", "Eigene"].map((group) => (
                <optgroup key={group} label={group}>
                  {INDEX_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={() => load(indexKey)}
              disabled={loading || scanning}
              className="btn text-xs"
              title="Ansicht aktualisieren"
              aria-label="Ansicht aktualisieren"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
            {data?.shared && (
              <button
                onClick={triggerScan}
                disabled={scanning || loading}
                className="btn btn-primary text-xs"
                title="Frische Kurse für alle User scannen"
              >
                {scanning ? <div className="spinner" /> : <Play size={12} aria-hidden="true" />}
                {scanning ? "Scanne..." : "Neu scannen"}
              </button>
            )}
          </div>
        )}
      </div>

      {collapsed ? (
        <div id="movers-body" className="text-xs text-[var(--muted)]">
          Eingeklappt — klick auf die Überschrift, um die Top-/Flop-Liste zu
          öffnen.
        </div>
      ) : (
        <div id="movers-body" className="space-y-3">

      {data?.snapshot && data.shared && (
        <div
          className={`text-[11px] flex flex-wrap gap-x-3 items-center ${
            ageHighlightClass(data.snapshot.scannedAt) || "text-[var(--muted)]"
          }`}
        >
          <Users size={11} className="text-[var(--accent)]" />
          {data.snapshot.scannedAt ? (
            <>
              <Clock size={10} />
              <span>
                zuletzt gescannt{" "}
                {new Date(data.snapshot.scannedAt).toLocaleString("de-DE")}
                {data.snapshot.scanDurationMs != null &&
                  ` · ${Math.round(data.snapshot.scanDurationMs / 1000)}s`}
              </span>
            </>
          ) : (
            <span className="text-yellow-400">
              Noch nicht gescannt — bitte „Neu scannen" drücken
            </span>
          )}
          {data.snapshot.scanInProgress && (
            <span className="text-yellow-400">⏳ Scan läuft...</span>
          )}
        </div>
      )}

      {data && !data.shared && data.snapshot.universeSize === 0 && (
        <div className="text-xs text-[var(--muted)]">
          Keine Einträge in deinem{" "}
          {indexKey === "portfolio" ? "Portfolio" : "Watchlist"}.
        </div>
      )}

      {error && (
        <div role="alert" className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} aria-hidden="true" /> {error}
        </div>
      )}

      {data?.snapshot.rows && data.snapshot.rows.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <MoverTable
            title="Top 10 Gewinner"
            icon={<TrendingUp size={14} className="text-[var(--green)]" />}
            rows={topRows}
            tone="green"
          />
          <MoverTable
            title="Flop 10 Verlierer"
            icon={<TrendingDown size={14} className="text-[var(--red)]" />}
            rows={flopRows}
            tone="red"
          />
        </div>
      )}

      {loading && !data && (
        <div className="text-sm text-[var(--muted)] flex items-center gap-2">
          <div className="spinner" /> Lade {currentOption?.label}...
        </div>
      )}
        </div>
      )}
    </div>
  );
}

function MoverTable({
  title,
  icon,
  rows,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  rows: MoverRow[];
  tone: "green" | "red";
}) {
  const pctClass = tone === "green" ? "text-[var(--green)]" : "text-[var(--red)]";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[var(--muted)]">
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-[var(--muted)] py-2">—</div>
      ) : (
        <div className="border border-[var(--border)] rounded overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.ticker}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/analysis/${encodeURIComponent(r.ticker)}`}
                      className="font-medium hover:text-[var(--accent)]"
                      aria-label={`Analyse für ${r.name || r.ticker} öffnen: ${fmtNumber(r.price, "de-DE", 2)} ${r.currency}, Veränderung ${r.changePct >= 0 ? "+" : ""}${fmtPercent(r.changePct)}`}
                    >
                      {r.ticker}
                    </Link>
                    {r.name && (
                      <div className="text-[10px] text-[var(--muted)] truncate max-w-[160px]">
                        {r.name}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right num text-[var(--muted)]">
                    {fmtNumber(r.price, "de-DE", 2)} {r.currency}
                  </td>
                  <td className={`px-2 py-1.5 text-right num font-semibold ${pctClass}`}>
                    {r.changePct >= 0 ? "+" : ""}
                    {fmtPercent(r.changePct)}
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
