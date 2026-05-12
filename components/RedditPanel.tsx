"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { MessageSquare, ThumbsUp, ExternalLink, AlertCircle } from "lucide-react";

interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  author: string;
  createdAt: string;
  permalink: string;
  upvoteRatio: number;
}

interface Props {
  ticker: string;
}

type Timeframe = "day" | "week" | "month";

const TIMEFRAMES: Timeframe[] = ["day", "week", "month"];

export function RedditPanel({ ticker }: Props) {
  const t = useTranslations("AnalysisPanels.reddit");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("week");
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReason(null);
    fetch(`/api/reddit/${encodeURIComponent(ticker)}?timeframe=${timeframe}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Neue Response: { posts, reason?, status? }. Alte: einfach Array.
        if (Array.isArray(data)) {
          setPosts(data);
        } else if (data && Array.isArray(data.posts)) {
          setPosts(data.posts);
          if (typeof data.reason === "string") setReason(data.reason);
        } else {
          setPosts([]);
        }
      })
      .catch(() => {
        if (!cancelled) setReason(t("networkError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, timeframe, t]);

  const sorted = [...posts].sort((a, b) => b.score - a.score);
  const totalScore = posts.reduce((s, p) => s + p.score, 0);
  const totalComments = posts.reduce((s, p) => s + p.numComments, 0);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} />
          <h2 className="font-semibold">{t("title")}</h2>
          {!loading && (
            <span className="text-xs text-[var(--muted)]">
              {t("summary", {
                posts: posts.length,
                upvotes: totalScore,
                comments: totalComments,
              })}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs rounded ${
                timeframe === tf
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {t(`timeframes.${tf}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[var(--muted)]">
          <div className="spinner" />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--muted)] space-y-2">
          {reason ? (
            <div className="text-[var(--red)] inline-flex items-start gap-2 text-left max-w-md mx-auto">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          ) : (
            <>{t("empty")}</>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.slice(0, 10).map((p) => (
            <a
              key={p.id}
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block card-hover p-3 rounded-md border border-[var(--border)] group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">{p.title}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--muted)]">
                    <span className="text-[var(--accent)]">r/{p.subreddit}</span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={11} />
                      {p.score}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={11} />
                      {p.numComments}
                    </span>
                    <span>
                      {new Date(p.createdAt).toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    {p.upvoteRatio > 0 && (
                      <span>{t("positive", { pct: Math.round(p.upvoteRatio * 100) })}</span>
                    )}
                  </div>
                </div>
                <ExternalLink
                  size={14}
                  className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                />
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
        {t("footer")}
      </p>
    </div>
  );
}
