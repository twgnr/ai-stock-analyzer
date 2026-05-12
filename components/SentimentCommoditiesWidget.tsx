"use client";

import { useEffect, useState } from "react";
import { Activity, Coins, AlertCircle, RefreshCw } from "lucide-react";
import { fmtNumber, fmtPercent, changeClass } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

interface Row {
  ticker: string;
  name: string;
  hint: string;
  category: "sentiment" | "commodity";
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

function fmtPrice(price: number, ticker: string): string {
  // Krypto + Indizes mit kleineren Dezimalen je nach Größe.
  if (ticker.startsWith("^") || ticker.endsWith("=X")) {
    return fmtNumber(price, "de-DE", 2);
  }
  if (price >= 1000) return fmtNumber(price, "de-DE", 0);
  if (price >= 100) return fmtNumber(price, "de-DE", 2);
  return fmtNumber(price, "de-DE", 2);
}

export function SentimentCommoditiesWidget() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/markets/sentiment-commodities", { cache: "no-store" });
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

  const sentiment = data?.rows.filter((r) => r.category === "sentiment") ?? [];
  const commodities = data?.rows.filter((r) => r.category === "commodity") ?? [];

  return (
    <div className="card p-4 space-y-3" data-help="feature:sentiment-commodities">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">Sentiment &amp; Rohstoffe</h2>
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

      {loading && !data && (
        <div className="text-xs text-[var(--muted)] flex items-center gap-2">
          <span className="spinner" /> Lade Marktdaten…
        </div>
      )}

      {error && (
        <div className="text-sm text-[var(--red)] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Section
            title="Sentiment / Risk"
            icon={<Activity size={11} aria-hidden="true" />}
            rows={sentiment}
          />
          <Section
            title="Rohstoffe / Crypto"
            icon={<Coins size={11} aria-hidden="true" />}
            rows={commodities}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5 mb-1">
        {icon} {title}
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div
            key={r.ticker}
            className="flex items-center justify-between gap-2 text-sm py-1 hover:bg-[var(--surface-2)] rounded px-1.5 -mx-1.5"
            title={r.hint}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-[10px] text-[var(--muted)] font-mono truncate">
                {r.ticker}
              </span>
            </div>
            <div className="text-right">
              <div className="num">{fmtPrice(r.price, r.ticker)}</div>
              <div className={`num text-xs ${changeClass(r.changePercent)}`}>
                {fmtPercent(r.changePercent)}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-xs text-[var(--muted)] py-2">— keine Daten —</div>
        )}
      </div>
    </div>
  );
}
