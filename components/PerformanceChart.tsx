"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { fmtCurrency } from "@/lib/format";

interface Snapshot {
  date: string;
  totalValueBase: number;
  totalCostBase: number;
  baseCurrency: string;
}

interface BenchmarkSeries {
  key: string;
  label: string;
  ticker: string;
  series: { date: string; close: number }[];
}

interface Props {
  days?: number;
}

const BENCHMARK_COLORS: Record<string, string> = {
  sp500: "#22c55e",
  nasdaq: "#ef4444",
  dax: "#f59e0b",
  stoxx600: "#a855f7",
  msciworld: "#06b6d4",
  gold: "#eab308",
};

export function PerformanceChart({ days = 180 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSeries[]>([]);
  const [availableBenchmarks, setAvailableBenchmarks] = useState<
    Record<string, { label: string; ticker: string }>
  >({});
  const [activeBenchmarks, setActiveBenchmarks] = useState<Set<string>>(
    new Set(["sp500", "msciworld"])
  );
  const [loading, setLoading] = useState(true);
  const [normalize, setNormalize] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/portfolio/history?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSnapshots(data.snapshots || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    const keys = [...activeBenchmarks].join(",");
    fetch(`/api/benchmarks?days=${days}&keys=${encodeURIComponent(keys)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBenchmarks(data.benchmarks || []);
        setAvailableBenchmarks(data.available || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [days, activeBenchmarks]);

  useEffect(() => {
    if (!ref.current || snapshots.length < 2) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "#12141a" },
        textColor: "#8a8f9a",
      },
      grid: {
        vertLines: { color: "#1a1d26" },
        horzLines: { color: "#1a1d26" },
      },
      rightPriceScale: { borderColor: "#262a35" },
      timeScale: { borderColor: "#262a35", timeVisible: true, secondsVisible: false },
    });

    const firstValue = snapshots[0]?.totalValueBase || 1;

    const valueSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      title: "Portfolio",
    });
    valueSeries.setData(
      snapshots.map((s) => ({
        time: Math.floor(new Date(s.date).getTime() / 1000) as Time,
        value: normalize ? (s.totalValueBase / firstValue) * 100 : s.totalValueBase,
      }))
    );

    if (!normalize) {
      const costSeries = chart.addSeries(LineSeries, {
        color: "#6b7280",
        lineWidth: 1,
        lineStyle: 2,
        title: "Eingesetzt",
      });
      costSeries.setData(
        snapshots.map((s) => ({
          time: Math.floor(new Date(s.date).getTime() / 1000) as Time,
          value: s.totalCostBase,
        }))
      );
    }

    if (normalize) {
      for (const b of benchmarks) {
        if (b.series.length < 2) continue;
        const firstClose = b.series[0].close;
        const s = chart.addSeries(LineSeries, {
          color: BENCHMARK_COLORS[b.key] || "#94a3b8",
          lineWidth: 1,
          lineStyle: 2,
          title: b.label,
        });
        s.setData(
          b.series.map((p) => ({
            time: Math.floor(new Date(p.date).getTime() / 1000) as Time,
            value: (p.close / firstClose) * 100,
          }))
        );
      }
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [snapshots, benchmarks, normalize]);

  const latest = snapshots[snapshots.length - 1];
  const oldest = snapshots[0];
  const change = latest && oldest ? latest.totalValueBase - oldest.totalValueBase : 0;
  const changePct =
    oldest && oldest.totalValueBase > 0 ? (change / oldest.totalValueBase) * 100 : 0;
  const base = latest?.baseCurrency || "EUR";

  function toggleBenchmark(key: string) {
    const next = new Set(activeBenchmarks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setActiveBenchmarks(next);
  }

  if (loading) {
    return (
      <div className="card p-4 text-center text-[var(--muted)] text-sm">
        <div className="spinner mb-2" />
        Lade Performance-Historie...
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="card p-4 text-sm text-[var(--muted)]">
        <p>
          Noch zu wenig Snapshots für einen Chart ({snapshots.length}/2). Tägliche Snapshots werden
          automatisch nachts um 23:55 erstellt. Oder manuell:
        </p>
        <button
          onClick={async () => {
            await fetch("/api/portfolio/history", { method: "POST" });
            location.reload();
          }}
          className="btn btn-primary mt-3"
        >
          Snapshot jetzt erstellen
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">Portfolio-Performance</h2>
        <div className="text-sm">
          {latest && oldest && (
            <>
              <span className="text-[var(--muted)] hidden sm:inline">
                {new Date(oldest.date).toLocaleDateString("de-DE")} →{" "}
                {new Date(latest.date).toLocaleDateString("de-DE")}:{" "}
              </span>
              <span className={change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
                {change >= 0 ? "+" : ""}
                {fmtCurrency(change, base)} ({changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span className="text-[var(--muted)]">Normiert (Start = 100, mit Benchmarks)</span>
        </label>
        {normalize && (
          <>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)]">Benchmarks:</span>
            {Object.entries(availableBenchmarks).map(([key, info]) => (
              <button
                key={key}
                onClick={() => toggleBenchmark(key)}
                className={`px-2 py-0.5 rounded border text-xs ${
                  activeBenchmarks.has(key)
                    ? "border-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
                style={
                  activeBenchmarks.has(key)
                    ? { borderColor: BENCHMARK_COLORS[key], color: BENCHMARK_COLORS[key] }
                    : {}
                }
              >
                {info.label}
              </button>
            ))}
          </>
        )}
      </div>
      <div ref={ref} style={{ height: 280 }} />
    </div>
  );
}
