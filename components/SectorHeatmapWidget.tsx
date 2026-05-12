"use client";

import { useEffect, useState } from "react";
import { Grid3x3, AlertCircle, RefreshCw } from "lucide-react";
import { fmtPercent } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

interface Row {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface ApiResponse {
  rows: Row[];
  asOf: number;
  error?: string;
}

/**
 * Map einer Tagesveränderung in % auf einen Heatmap-Hintergrund.
 * - Positiv (grün) ab 0, Sättigung steigt linear bis 3 %
 * - Negativ (rot) analog
 * - Reine SVG/CSS-Lösung, kein Canvas — schnell und a11y-freundlich.
 */
function heatmapStyle(changePct: number): React.CSSProperties {
  const intensity = Math.min(1, Math.abs(changePct) / 3);
  // Alpha-Werte zwischen 0.08 und 0.55 für sichtbare Abstufung
  const alpha = 0.08 + 0.47 * intensity;
  if (changePct >= 0) {
    return { backgroundColor: `rgba(34, 197, 94, ${alpha.toFixed(2)})` };
  }
  return { backgroundColor: `rgba(239, 68, 68, ${alpha.toFixed(2)})` };
}

function textColor(changePct: number): string {
  if (Math.abs(changePct) < 0.1) return "text-[var(--foreground)]";
  return changePct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";
}

export function SectorHeatmapWidget() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/markets/sector-heatmap", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card p-4 space-y-3" data-help="feature:sector-heatmap">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Grid3x3 size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">US-Sektor-Heatmap</h2>
          <span className="text-[10px] text-[var(--muted)]">SPDR-ETFs</span>
        </div>
        <div className="flex items-center gap-2">
          {data?.asOf && (
            <span
              className={`text-[10px] num ${
                ageHighlightClass(data.asOf) || "text-[var(--muted)]"
              }`}
            >
              {new Date(data.asOf).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="btn text-xs"
            title="Aktualisieren"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Tagesveränderung der 11 SPDR Sector ETFs — schnelle Übersicht, was den US-Markt
        heute treibt oder bremst. Klick auf einen Sektor öffnet die Detail-Analyse.
      </p>

      {loading && !data && (
        <div className="text-xs text-[var(--muted)] flex items-center gap-2">
          <span className="spinner" /> Lade Sektor-Daten…
        </div>
      )}

      {error && (
        <div className="text-sm text-[var(--red)] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.rows.map((r) => (
            <a
              key={r.ticker}
              href={`/analysis/${encodeURIComponent(r.ticker)}`}
              className="rounded-md p-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
              style={heatmapStyle(r.changePercent)}
              title={`${r.name} (${r.ticker})`}
            >
              <div className="font-mono text-xs font-semibold">{r.ticker}</div>
              <div className="text-[11px] text-[var(--foreground)]/80 truncate mt-0.5">
                {r.name}
              </div>
              <div
                className={`text-base font-semibold num mt-1 ${textColor(r.changePercent)}`}
              >
                {fmtPercent(r.changePercent)}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
