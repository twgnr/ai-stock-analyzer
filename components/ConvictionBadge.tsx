"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Breakdown {
  analyst: number;
  valuation: number;
  position52W: number;
  aiRecommendation: number;
  momentum: number;
}

interface ConvictionResult {
  ticker: string;
  score: number;
  breakdown: Breakdown;
  label: string;
}

const scoreCache = new Map<string, ConvictionResult>();

export async function fetchConvictionScores(
  tickers: string[]
): Promise<Record<string, ConvictionResult>> {
  if (tickers.length === 0) return {};
  const res = await fetch(`/api/conviction?tickers=${encodeURIComponent(tickers.join(","))}`);
  const data = await res.json();
  const result: Record<string, ConvictionResult> = {};
  for (const [k, v] of Object.entries(data.scores || {})) {
    result[k.toUpperCase()] = v as ConvictionResult;
    scoreCache.set(k.toUpperCase(), v as ConvictionResult);
  }
  return result;
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-[var(--green)] border-green-500/40 bg-green-500/10";
  if (score >= 60) return "text-green-400 border-green-500/30 bg-green-500/5";
  if (score >= 40) return "text-yellow-400 border-yellow-500/30 bg-yellow-500/5";
  if (score >= 20) return "text-orange-400 border-orange-500/30 bg-orange-500/5";
  return "text-[var(--muted)] border-[var(--border)]";
}

interface BadgeProps {
  ticker?: string;
  score?: ConvictionResult;
  showBreakdown?: boolean;
}

export function ConvictionBadge({ ticker, score, showBreakdown }: BadgeProps) {
  const t = useTranslations("Recommendation.conviction");
  const tBreakdown = useTranslations("Recommendation.conviction.breakdown");
  const [data, setData] = useState<ConvictionResult | null>(score || null);

  useEffect(() => {
    if (score) {
      setData(score);
      return;
    }
    if (!ticker) return;
    const cached = scoreCache.get(ticker.toUpperCase());
    if (cached) {
      setData(cached);
      return;
    }
    fetchConvictionScores([ticker]).then((r) => {
      const hit = r[ticker.toUpperCase()];
      if (hit) setData(hit);
    });
  }, [ticker, score]);

  if (!data) {
    return (
      <span className="inline-flex items-center justify-center h-5 w-11 text-[10px] rounded border border-[var(--border)] text-[var(--muted)] opacity-40">
        …
      </span>
    );
  }

  const cls = scoreColor(data.score);

  if (showBreakdown) {
    return (
      <div className="space-y-2">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${cls}`}>
          <span className="text-xl font-bold num">{data.score}</span>
          <span className="text-xs">{data.label}</span>
        </div>
        <div className="text-xs space-y-1">
          <Row label={tBreakdown("analyst")} value={data.breakdown.analyst} max={25} />
          <Row label={tBreakdown("valuation")} value={data.breakdown.valuation} max={20} />
          <Row label={tBreakdown("position52W")} value={data.breakdown.position52W} max={20} />
          <Row label={tBreakdown("aiRecommendation")} value={data.breakdown.aiRecommendation} max={20} />
          <Row label={tBreakdown("momentum")} value={data.breakdown.momentum} max={15} />
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded border num ${cls}`}
      title={t("title", { score: data.score, label: data.label })}
      aria-label={t("ariaLabel", { score: data.score, label: data.label })}
    >
      {data.score}
    </span>
  );
}

function Row({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--muted)] flex-1 text-[11px]">{label}</span>
      <div className="w-24 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className="h-full bg-[var(--accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="num text-[11px] w-10 text-right">
        {value}/{max}
      </span>
    </div>
  );
}
