"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, ChevronRight, RefreshCw } from "lucide-react";
import { fmtNumber } from "@/lib/format";

interface SubScore {
  key: string;
  label: string;
  score: number;
  weight: number;
  explanation: string;
}

interface Payload {
  positions: number;
  totalScore?: number;
  grade?: string;
  subScores?: SubScore[];
  stats?: {
    hhi: number;
    largestWeight: number;
    topSectorWeight: number;
    avgBeta: number;
    sectorCount: number;
  };
  message?: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-[var(--green)] border-[var(--green)]/40 bg-green-500/10",
  B: "text-green-400 border-green-500/30 bg-green-500/5",
  C: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
  D: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  F: "text-[var(--red)] border-[var(--red)]/40 bg-red-500/10",
};

export function PortfolioHealthCard({ detailed = false }: { detailed?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/health");
      if (res.status === 401) return;
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="card p-4">
        <div className="text-xs text-[var(--muted)]">Lade Portfolio-Health...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4 text-sm text-[var(--red)]">Fehler: {error}</div>
    );
  }

  if (!data || data.positions === 0) return null;

  const gradeCls = GRADE_COLORS[data.grade || "C"];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <HeartPulse size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">Portfolio-Health</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn text-xs" aria-label="Neu berechnen">
            <RefreshCw size={12} aria-hidden="true" />
          </button>
          {!detailed && (
            <Link
              href="/portfolio/health"
              className="btn text-xs inline-flex items-center gap-1"
            >
              Details <ChevronRight size={12} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`border rounded-lg p-3 min-w-[72px] text-center ${gradeCls}`}
          aria-label={`Gesamt-Note ${data.grade}, Score ${data.totalScore} von 100`}
        >
          <div className="text-3xl font-bold leading-none">{data.grade}</div>
          <div className="text-xs mt-1 num">{data.totalScore} / 100</div>
        </div>
        <div className="flex-1 grid grid-cols-5 gap-1">
          {(data.subScores || []).map((s) => (
            <div
              key={s.key}
              className="text-center"
              title={`${s.label}: ${s.score}/100 — ${s.explanation}`}
            >
              <div className="text-[10px] text-[var(--muted)]">
                {s.label.split(" ")[0]}
              </div>
              <div
                className={`text-sm num font-semibold ${
                  s.score >= 70
                    ? "text-[var(--green)]"
                    : s.score >= 40
                      ? "text-yellow-400"
                      : "text-[var(--red)]"
                }`}
              >
                {s.score}
              </div>
              <div
                className="h-1 rounded-full mt-1 bg-[var(--surface-2)]"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${
                    s.score >= 70
                      ? "bg-[var(--green)]"
                      : s.score >= 40
                        ? "bg-yellow-400"
                        : "bg-[var(--red)]"
                  }`}
                  style={{ width: `${s.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {detailed && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-[var(--border)] text-xs">
            {data.stats && (
              <>
                <Stat
                  label="Positionen"
                  value={String(data.positions)}
                />
                <Stat
                  label="Sektoren"
                  value={String(data.stats.sectorCount)}
                />
                <Stat
                  label="Größte Position"
                  value={`${fmtNumber(data.stats.largestWeight * 100, "de-DE", 1)}%`}
                />
                <Stat
                  label="Ø Beta"
                  value={fmtNumber(data.stats.avgBeta, "de-DE", 2)}
                />
              </>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-[var(--border)]">
            {(data.subScores || []).map((s) => (
              <div key={s.key} className="flex items-start gap-3">
                <div
                  className={`text-lg num font-semibold min-w-[2.5rem] ${
                    s.score >= 70
                      ? "text-[var(--green)]"
                      : s.score >= 40
                        ? "text-yellow-400"
                        : "text-[var(--red)]"
                  }`}
                >
                  {s.score}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {s.label}{" "}
                    <span className="text-[var(--muted)] text-xs">
                      (Gewicht {fmtNumber(s.weight * 100, "de-DE", 0)}%)
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{s.explanation}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className="num font-semibold">{value}</div>
    </div>
  );
}
