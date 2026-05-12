"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Trophy,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { fmtPercent, changeClass } from "@/lib/format";

interface AggregateBucket {
  total: number;
  hits: number;
  hitRatePct: number;
  avgReturnPct: number;
}

interface Outcome {
  ticker: string;
  name?: string;
  recommendation: string;
  confidence?: number;
  model: string;
  createdAt: string;
  originPrice: number;
  currentPrice: number;
  returnPct: number;
  daysHeld: number;
  hit: boolean | null;
}

interface TrackRecordResponse {
  totalAnalyses: number;
  evaluatable: number;
  overall: AggregateBucket;
  byRecommendation: Record<string, AggregateBucket>;
  byModel: Record<string, AggregateBucket>;
  outcomes: Outcome[];
}

export default function TrackRecordPage() {
  const t = useTranslations("Insights.trackRecord");
  const tCommon = useTranslations("Insights.common");
  const [data, setData] = useState<TrackRecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/insights/track-record")
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : tCommon("error")))
      .finally(() => setLoading(false));
  }, [tCommon]);

  if (loading) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        <div className="spinner mb-2" />
        <div>{t("loading")}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card p-4 text-[var(--red)] flex items-start gap-2">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }
  if (!data || data.evaluatable === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy size={22} className="text-[var(--accent)]" /> {t("title")}
        </h1>
        <div className="card p-8 text-center text-[var(--muted)] space-y-1">
          <Activity size={28} className="mx-auto mb-2 opacity-40" />
          <div>{t("empty")}</div>
          <div className="text-xs">{t("emptyHint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy size={22} className="text-[var(--accent)]" /> {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">{t("description")}</p>
      </div>

      {/* Overall + Buckets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t("stats.totalHitRate")}
          value={`${data.overall.hitRatePct.toFixed(0)}%`}
          sub={`${data.overall.hits}/${data.overall.total}`}
          icon={<Target size={16} className="text-[var(--accent)]" />}
        />
        <StatCard
          label={t("stats.avgReturn")}
          value={fmtPercent(data.overall.avgReturnPct)}
          valueClass={changeClass(data.overall.avgReturnPct)}
          sub={t("stats.avgReturnSub", { count: data.overall.total })}
          icon={
            data.overall.avgReturnPct >= 0 ? (
              <TrendingUp size={16} className="text-[var(--green)]" />
            ) : (
              <TrendingDown size={16} className="text-[var(--red)]" />
            )
          }
        />
        <StatCard
          label={t("stats.evaluatable")}
          value={`${data.evaluatable}`}
          sub={t("stats.evaluatableSub", { count: data.totalAnalyses })}
          icon={<Activity size={16} className="text-[var(--accent)]" />}
        />
        <StatCard
          label={t("stats.oldestEntry")}
          value={
            data.outcomes.length > 0
              ? t("stats.days", { count: data.outcomes[data.outcomes.length - 1].daysHeld })
              : "-"
          }
          sub={t("stats.oldestEntrySub")}
          icon={<Activity size={16} className="text-[var(--accent)]" />}
        />
      </div>

      {/* By Recommendation */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          {t("byRecommendation")}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(data.byRecommendation)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([rec, bucket]) => (
              <div key={rec} className="card p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <RecommendationBadge recommendation={rec} />
                  <span className="text-xs text-[var(--muted)] num">
                    {bucket.hits}/{bucket.total}
                  </span>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">{bucket.hitRatePct.toFixed(0)}%</div>
                  <div
                    className={`num text-xs ${changeClass(bucket.avgReturnPct)}`}
                  >
                    {t("avgReturnPrefix")} {fmtPercent(bucket.avgReturnPct)}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* By Model */}
      {Object.keys(data.byModel).length > 1 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("byModel")}
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">{t("table.model")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("table.count")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("table.hitRate")}</th>
                  <th className="text-right font-medium px-3 py-2">{t("table.avgReturn")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byModel)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([model, bucket]) => (
                    <tr
                      key={model}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{model}</td>
                      <td className="px-3 py-2 text-right num">{bucket.total}</td>
                      <td className="px-3 py-2 text-right num font-medium">
                        {bucket.hitRatePct.toFixed(0)}%
                      </td>
                      <td
                        className={`px-3 py-2 text-right num ${changeClass(bucket.avgReturnPct)}`}
                      >
                        {fmtPercent(bucket.avgReturnPct)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Detail-Outcomes */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          {t("outcomes.title")}
        </h2>
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-3 py-2">{t("outcomes.ticker")}</th>
                <th className="text-left font-medium px-3 py-2">{t("outcomes.recommendation")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.date")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.days")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.originPrice")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.current")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.return")}</th>
                <th className="text-right font-medium px-3 py-2">{t("outcomes.result")}</th>
              </tr>
            </thead>
            <tbody>
              {data.outcomes.map((o, i) => (
                <tr
                  key={`${o.ticker}-${o.createdAt}-${i}`}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/analysis/${encodeURIComponent(o.ticker)}`}
                      className="font-semibold hover:underline"
                    >
                      {o.ticker}
                    </Link>
                    {o.name && (
                      <div className="text-[10px] text-[var(--muted)] truncate max-w-[160px]">
                        {o.name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RecommendationBadge recommendation={o.recommendation} />
                  </td>
                  <td className="px-3 py-2 text-right num text-xs text-[var(--muted)]">
                    {o.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-right num text-xs text-[var(--muted)]">
                    {t("stats.days", { count: o.daysHeld })}
                  </td>
                  <td className="px-3 py-2 text-right num text-xs">
                    {o.originPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right num text-xs">
                    {o.currentPrice.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2 text-right num ${changeClass(o.returnPct)}`}>
                    {fmtPercent(o.returnPct)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {o.hit === true ? (
                      <span className="text-[var(--green)] font-medium">{t("outcomes.hit")}</span>
                    ) : o.hit === false ? (
                      <span className="text-[var(--red)] font-medium">{t("outcomes.miss")}</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">{t("note")}</p>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="card p-3">
      <div className="text-xs text-[var(--muted)] mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold num ${valueClass || ""}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--muted)] num mt-0.5">{sub}</div>}
    </div>
  );
}
