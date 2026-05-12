"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  AlertCircle,
  MessageCircle,
} from "lucide-react";

type Sentiment = "bullish" | "bearish" | null;

interface Message {
  id: number;
  body: string;
  createdAt: string;
  username: string;
  userAvatar?: string;
  sentiment: Sentiment;
  url: string;
  likeCount: number;
}

interface Stream {
  ticker: string;
  found: boolean;
  messages: Message[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  bullishRatio: number | null;
  reason?: string;
}

interface Props {
  ticker: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h`;
  return `${Math.round(diffSec / 86400)}d`;
}

export function StocktwitsPanel({ ticker }: Props) {
  const t = useTranslations("AnalysisPanels.stocktwits");
  const [data, setData] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/stocktwits/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: Stream) => {
        if (cancelled) return;
        setData(d);
        if (d.reason) setError(d.reason);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("networkError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, t]);

  const bullish = data?.bullishCount ?? 0;
  const bearish = data?.bearishCount ?? 0;
  const tagged = bullish + bearish;
  const ratio = data?.bullishRatio;

  return (
    <div className="card p-4 space-y-3" data-help="stocktwits-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">{t("title")}</h2>
          {data && data.found && (
            <span className="text-xs text-[var(--muted)]">
              {t("postsCount", { count: data.messages.length })}
              {tagged > 0 && (
                <>
                  {" · "}
                  <span className="text-[var(--green)]">
                    {t("bullishCount", { count: bullish })}
                  </span>
                  {" · "}
                  <span className="text-[var(--red)]">
                    {t("bearishCount", { count: bearish })}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        {data?.found && (
          <a
            href={`https://stocktwits.com/symbol/${data.ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] inline-flex items-center gap-1"
          >
            {t("viewOnSite")}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">
        {t("intro")}
      </p>

      {error && (
        <div role="alert" className="text-xs text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-sm text-[var(--muted)] flex items-center gap-2">
          <div className="spinner" /> {t("loading")}
        </div>
      )}

      {!loading && data && !data.found && !error && (
        <div className="text-sm text-[var(--muted)] italic">
          {t("notAvailable")}
        </div>
      )}

      {data?.found && tagged > 0 && ratio != null && (
        <div className="space-y-1.5">
          <div className="text-xs text-[var(--muted)] flex justify-between">
            <span className="inline-flex items-center gap-1 text-[var(--green)]">
              <TrendingUp size={11} aria-hidden="true" />
              {t("bullishPct", { pct: Math.round(ratio * 100) })}
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--red)]">
              {t("bearishPct", { pct: Math.round((1 - ratio) * 100) })}
              <TrendingDown size={11} aria-hidden="true" />
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden flex"
            role="img"
            aria-label={t("sentimentAria", { pct: Math.round(ratio * 100) })}
          >
            <div
              className="bg-[var(--green)]"
              style={{ width: `${ratio * 100}%` }}
            />
            <div
              className="bg-[var(--red)] flex-1"
            />
          </div>
        </div>
      )}

      {data?.found && data.messages.length > 0 && (
        <ul className="space-y-2">
          {data.messages.slice(0, 8).map((m) => (
            <li
              key={m.id}
              className={`border rounded-lg p-3 text-sm ${
                m.sentiment === "bullish"
                  ? "border-[var(--green)]/30"
                  : m.sentiment === "bearish"
                    ? "border-[var(--red)]/30"
                    : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-[var(--muted)] truncate">
                    @{m.username}
                  </span>
                  {m.sentiment === "bullish" && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--green)] bg-[var(--green)]/10 px-1.5 py-0.5 rounded">
                      <TrendingUp size={9} aria-hidden="true" />
                      {t("bullishTag")}
                    </span>
                  )}
                  {m.sentiment === "bearish" && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--red)] bg-[var(--red)]/10 px-1.5 py-0.5 rounded">
                      <TrendingDown size={9} aria-hidden="true" />
                      {t("bearishTag")}
                    </span>
                  )}
                </div>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)] flex-shrink-0"
                  title={t("openOriginal")}
                >
                  {timeAgo(m.createdAt)} ↗
                </a>
              </div>
              <p className="text-xs whitespace-pre-wrap break-words line-clamp-4">
                {m.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
