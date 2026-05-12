"use client";

import { useEffect, useState } from "react";
import { fmtCurrency, fmtNumber } from "@/lib/format";

interface Bucket {
  label: string;
  valueBase: number;
  weight: number;
  tickers: string[];
}

interface AllocationData {
  sectors: Bucket[];
  regions: Bucket[];
  totalValueBase: number;
  baseCurrency: string;
}

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#eab308",
  "#14b8a6",
  "#6366f1",
  "#f97316",
];

function PieChart({ buckets, size = 180 }: { buckets: Bucket[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const radius = size / 2;
  const cx = radius;
  const cy = radius;
  const total = buckets.reduce((s, b) => s + b.valueBase, 0);
  if (total === 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-sm text-[var(--muted)]"
      >
        Keine Daten
      </div>
    );
  }

  let startAngle = -Math.PI / 2;
  const slices = buckets.map((b, i) => {
    const angle = (b.valueBase / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const slice = { path, color: COLORS[i % COLORS.length], bucket: b, index: i };
    startAngle = endAngle;
    return slice;
  });

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {slices.map((s) => (
        <path
          key={s.index}
          d={s.path}
          fill={s.color}
          stroke="#12141a"
          strokeWidth={2}
          opacity={hover == null || hover === s.index ? 1 : 0.4}
          onMouseEnter={() => setHover(s.index)}
          onMouseLeave={() => setHover(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
    </svg>
  );
}

function Legend({ buckets, baseCurrency }: { buckets: Bucket[]; baseCurrency: string }) {
  return (
    <div className="space-y-1 text-xs">
      {buckets.map((b, i) => (
        <div key={b.label} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ background: COLORS[i % COLORS.length] }}
          />
          <span className="flex-1 truncate">{b.label}</span>
          <span className="num text-[var(--muted)]">{fmtNumber(b.weight, "de-DE", 1)}%</span>
          <span className="num text-[var(--muted)] hidden sm:inline">
            {fmtCurrency(b.valueBase, baseCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AllocationPieCharts() {
  const [data, setData] = useState<AllocationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio/allocation")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="card p-4 text-center text-[var(--muted)] text-sm">
        <div className="spinner mb-2" />
        Lade Aufteilung...
      </div>
    );
  }

  if (!data || data.sectors.length === 0) {
    return null;
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
          Sektor-Verteilung
        </h3>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <PieChart buckets={data.sectors} />
          <div className="flex-1 w-full">
            <Legend buckets={data.sectors} baseCurrency={data.baseCurrency} />
          </div>
        </div>
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
          Regions-Verteilung
        </h3>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <PieChart buckets={data.regions} />
          <div className="flex-1 w-full">
            <Legend buckets={data.regions} baseCurrency={data.baseCurrency} />
          </div>
        </div>
      </div>
    </div>
  );
}
