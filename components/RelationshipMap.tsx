"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Network,
  Users,
  Truck,
  Handshake,
  Swords,
  TrendingUp,
  GitBranch,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";

type RelationshipType =
  | "customer"
  | "supplier"
  | "partner"
  | "competitor"
  | "investor"
  | "subsidiary";

interface Relationship {
  ticker: string | null;
  name: string;
  type: RelationshipType;
  description: string;
  strength: "strong" | "medium" | "weak";
}

interface Props {
  ticker: string;
  centerName: string;
}

interface Result {
  summary: string;
  relationships: Relationship[];
  model?: string;
  cached?: boolean;
  updatedAt?: string;
}

const CATEGORIES: Array<{
  type: RelationshipType;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bg: string;
}> = [
  { type: "customer", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { type: "supplier", icon: Truck, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  { type: "partner", icon: Handshake, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  { type: "competitor", icon: Swords, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { type: "investor", icon: TrendingUp, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  { type: "subsidiary", icon: GitBranch, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
];

const STRENGTH_BARS: Record<"strong" | "medium" | "weak", number> = {
  strong: 3,
  medium: 2,
  weak: 1,
};

export function RelationshipMap({ ticker, centerName }: Props) {
  const t = useTranslations("AnalysisPanels.relationships");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingCache, setCheckingCache] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCheckingCache(true);
    setResult(null);
    fetch("/api/analyze/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, cacheOnly: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && data.relationships && Array.isArray(data.relationships)) {
          setResult(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingCache(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  async function load(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">{t("title")}</h2>
          {result?.cached && (
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <Clock size={11} />
              {t("cached")}
              {result.updatedAt && (
                <>{t("cachedAt", { date: new Date(result.updatedAt).toLocaleDateString(dateLocale) })}</>
              )}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {result && (
            <button onClick={() => load(true)} disabled={loading} className="btn text-xs">
              <RefreshCw size={12} />
              {t("rerun")}
            </button>
          )}
          {!result && (
            <button onClick={() => load(false)} disabled={loading} className="btn btn-primary">
              {loading ? <div className="spinner" /> : <Sparkles size={14} />}
              {loading ? t("running") : t("run")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {checkingCache && !result && (
        <div className="text-sm text-[var(--muted)] flex items-center gap-2">
          <div className="spinner" />
          {t("checkingCache")}
        </div>
      )}

      {!checkingCache && !result && !loading && !error && (
        <p className="text-sm text-[var(--muted)]">
          {t.rich("intro", {
            ticker,
            name: centerName,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}

      {result && (
        <>
          <div className="border border-[var(--accent)]/30 bg-blue-500/5 rounded-md p-3 text-center">
            <div className="text-lg font-bold">{ticker}</div>
            <div className="text-sm text-[var(--muted)]">{centerName}</div>
            <p className="text-sm mt-2">{result.summary}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const items = result.relationships.filter((r) => r.type === cat.type);
              if (items.length === 0) return null;
              const Icon = cat.icon;
              const label = t(`categories.${cat.type}` as Parameters<typeof t>[0]);
              return (
                <div key={cat.type} className={`border rounded-md p-3 ${cat.bg}`}>
                  <div className={`flex items-center gap-2 mb-2 font-semibold text-sm ${cat.color}`}>
                    <Icon size={14} />
                    {t("categoryCount", { label, count: items.length })}
                  </div>
                  <div className="space-y-2">
                    {items.map((r, i) => (
                      <RelationshipCard key={i} relationship={r} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}

function RelationshipCard({ relationship: r }: { relationship: Relationship }) {
  const t = useTranslations("AnalysisPanels.relationships");
  const bars = STRENGTH_BARS[r.strength];
  return (
    <div className="flex items-start gap-2 bg-[var(--surface)] rounded px-2 py-1.5 border border-[var(--border)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {r.ticker ? (
            <Link
              href={`/analysis/${encodeURIComponent(r.ticker)}`}
              className="font-semibold text-sm hover:text-[var(--accent)]"
            >
              {r.ticker}
            </Link>
          ) : (
            <span className="font-semibold text-sm">{r.name}</span>
          )}
          {r.ticker && <span className="text-xs text-[var(--muted)] truncate">{r.name}</span>}
          <span
            className="flex gap-0.5"
            role="img"
            aria-label={t("strengthAria", { strength: r.strength })}
          >
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`w-1 h-3 rounded-sm ${
                  i <= bars ? "bg-[var(--foreground)]/60" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </span>
        </div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{r.description}</div>
      </div>
    </div>
  );
}
