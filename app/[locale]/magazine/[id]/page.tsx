"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  AlertCircle,
  Globe,
  Lock,
  Trash2,
  FileText,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  Clock,
  BookOpen,
  User as UserIcon,
  Cpu,
} from "lucide-react";
import { fmtNumber } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

type Rec = "BUY" | "HOLD" | "SELL" | "ACCUMULATE" | "REDUCE" | "WATCH";

interface PriceTarget {
  value: number;
  currency: string;
}

interface Recommendation {
  ticker?: string | null;
  name: string;
  recommendation: Rec;
  priceTarget?: PriceTarget | null;
  stopLoss?: PriceTarget | null;
  horizon?: "kurz" | "mittel" | "lang" | null;
  rationale: string;
  pageReference?: string | null;
  risks?: string[];
}

interface Detail {
  _id: string;
  magazineTitle: string;
  customTitle?: string | null;
  issueNumber?: string | null;
  issueDate?: string | null;
  summary: string;
  coverTopics: string[];
  marketOutlook?: string | null;
  recommendations: Recommendation[];
  isPublic: boolean;
  isOwn: boolean;
  uploaderName?: string;
  uploaderEmail?: string;
  originalFilename?: string;
  provider?: string | null;
  model?: string;
  createdAt: string;
  config?: { sharingEnabled: boolean };
}

const REC_TONES: Record<Rec, "green" | "red" | "neutral"> = {
  BUY: "green",
  ACCUMULATE: "green",
  HOLD: "neutral",
  WATCH: "neutral",
  SELL: "red",
  REDUCE: "red",
};

const REC_ICONS: Record<Rec, React.ReactNode> = {
  BUY: <TrendingUp size={14} />,
  ACCUMULATE: <TrendingUp size={14} />,
  HOLD: <Minus size={14} />,
  WATCH: <Minus size={14} />,
  SELL: <TrendingDown size={14} />,
  REDUCE: <TrendingDown size={14} />,
};

export default function MagazineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("Magazine.detail");
  const locale = useLocale();
  const localeForDate = locale === "de" ? "de-DE" : "en-US";
  const localeForNumber = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterRec, setFilterRec] = useState<Rec | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/magazine/${id}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("errorNotLoadable"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleShare() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/magazine/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !data.isPublic }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData({ ...data, isPublic: json.isPublic });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(t("confirmDelete"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/magazine/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error);
      }
      window.location.href = "/magazine";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        <div className="spinner mb-2" />
        {t("loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="card p-4 text-[var(--red)] flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  if (!data) return null;

  const recs =
    filterRec === "all"
      ? data.recommendations
      : data.recommendations.filter((r) => r.recommendation === filterRec);

  const counts = data.recommendations.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.recommendation] = (acc[r.recommendation] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <Link
        href="/magazine"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen size={20} className="text-[var(--accent)]" />
              <h1 className="text-2xl font-semibold">
                {data.customTitle || data.magazineTitle}
              </h1>
              {data.isPublic ? (
                <span className="text-xs inline-flex items-center gap-1 border border-[var(--green)]/30 text-[var(--green)] bg-green-500/10 rounded px-2 py-0.5">
                  <Globe size={11} /> {t("shared")}
                </span>
              ) : (
                <span className="text-xs inline-flex items-center gap-1 border border-[var(--border)] text-[var(--muted)] rounded px-2 py-0.5">
                  <Lock size={11} /> {t("private")}
                </span>
              )}
            </div>
            {data.customTitle && data.customTitle !== data.magazineTitle && (
              <div className="text-sm text-[var(--muted)] mt-0.5">
                {t("fromMagazine", { title: data.magazineTitle })}
              </div>
            )}
            <div className="text-sm text-[var(--muted)] mt-1">
              {data.issueNumber && <span>{data.issueNumber}</span>}
              {data.issueNumber && data.issueDate && <span> • </span>}
              {data.issueDate && <span>{data.issueDate}</span>}
            </div>
          </div>
          {data.isOwn && (
            <div className="flex gap-2 flex-wrap">
              {/* Share-Button: nur wenn Sharing global aktiv ODER Analyse aktuell
                  noch public (damit man sie noch privat schalten kann). */}
              {(data.config?.sharingEnabled !== false || data.isPublic) && (
                <button
                  onClick={toggleShare}
                  disabled={busy}
                  className={`btn ${data.isPublic ? "" : "btn-primary"}`}
                >
                  {data.isPublic ? (
                    <>
                      <Lock size={14} /> {t("stopSharing")}
                    </>
                  ) : (
                    <>
                      <Globe size={14} /> {t("shareAll")}
                    </>
                  )}
                </button>
              )}
              <button onClick={remove} disabled={busy} className="btn btn-danger">
                <Trash2 size={14} /> {t("delete")}
              </button>
            </div>
          )}
        </div>

        <div className="text-xs text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
          {data.uploaderName && (
            <span className="inline-flex items-center gap-1">
              <UserIcon size={12} /> {data.uploaderName}
              {data.isOwn && t("uploaderSelf")}
            </span>
          )}
          {data.originalFilename && (
            <span className="inline-flex items-center gap-1">
              <FileText size={12} /> {data.originalFilename}
            </span>
          )}
          <span className={ageHighlightClass(data.createdAt)}>
            {t("analyzedAt", { date: new Date(data.createdAt).toLocaleString(localeForDate) })}
          </span>
          {data.model && (
            <span className="inline-flex items-center gap-1">
              <Cpu size={12} /> {data.model}
            </span>
          )}
        </div>

        {data.summary && (
          <div className="pt-3 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("summary")}
            </div>
            <p className="text-sm">{data.summary}</p>
          </div>
        )}

        {data.coverTopics && data.coverTopics.length > 0 && (
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("coverTopics")}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.coverTopics.map((topic, i) => (
                <span
                  key={i}
                  className="text-xs border border-[var(--border)] rounded-full px-3 py-1"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.marketOutlook && (
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
              {t("marketOutlook")}
            </div>
            <p className="text-sm text-[var(--muted)]">{data.marketOutlook}</p>
          </div>
        )}
      </div>

      {data.recommendations.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" />
              {data.recommendations.length === 1
                ? t("recommendationsHeadingOne", { count: data.recommendations.length })
                : t("recommendationsHeadingOther", { count: data.recommendations.length })}
            </h2>
            <div className="flex gap-1 flex-wrap">
              <FilterChip
                active={filterRec === "all"}
                onClick={() => setFilterRec("all")}
              >
                {t("filterAll", { count: data.recommendations.length })}
              </FilterChip>
              {(Object.keys(REC_TONES) as Rec[]).map((k) =>
                counts[k] ? (
                  <FilterChip
                    key={k}
                    active={filterRec === k}
                    onClick={() => setFilterRec(k)}
                  >
                    {t(`rec.${k}` as `rec.${Rec}`)} ({counts[k]})
                  </FilterChip>
                ) : null
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {recs.map((r, i) => (
              <RecommendationCard key={i} r={r} localeForNumber={localeForNumber} />
            ))}
          </div>
        </>
      )}

      {data.recommendations.length === 0 && (
        <div className="card p-8 text-center text-[var(--muted)]">
          {t("noRecommendations")}
        </div>
      )}

      <div className="card p-3 text-xs text-[var(--muted)]">
        {t("disclaimer")}
      </div>
    </div>
  );
}

function RecommendationCard({ r, localeForNumber }: { r: Recommendation; localeForNumber: string }) {
  const t = useTranslations("Magazine.detail");
  const tone = REC_TONES[r.recommendation];
  const icon = REC_ICONS[r.recommendation];
  const toneClass =
    tone === "green"
      ? "text-[var(--green)] bg-green-500/10 border-green-500/30"
      : tone === "red"
        ? "text-[var(--red)] bg-red-500/10 border-red-500/30"
        : "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--border)]";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {r.ticker ? (
              <Link
                href={`/analysis/${encodeURIComponent(r.ticker)}`}
                className="font-semibold text-lg hover:text-[var(--accent)]"
              >
                {r.ticker}
              </Link>
            ) : (
              <span className="font-semibold text-lg">{r.name}</span>
            )}
            {r.ticker && (
              <span className="text-sm text-[var(--muted)]">{r.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
            <span
              className={`inline-flex items-center gap-1 border rounded px-2 py-0.5 ${toneClass}`}
            >
              {icon}
              {t(`rec.${r.recommendation}` as `rec.${Rec}`)}
            </span>
            {r.horizon && (
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <Clock size={11} /> {t(`horizon.${r.horizon}` as `horizon.${"kurz" | "mittel" | "lang"}`)}
              </span>
            )}
            {r.pageReference && (
              <span className="text-[var(--muted)]">{r.pageReference}</span>
            )}
          </div>
        </div>
      </div>

      {(r.priceTarget || r.stopLoss) && (
        <div className="grid grid-cols-2 gap-3">
          {r.priceTarget && (
            <div>
              <div className="text-xs text-[var(--muted)] flex items-center gap-1">
                <Target size={11} /> {t("priceTarget")}
              </div>
              <div className="num font-medium text-[var(--green)]">
                {fmtNumber(r.priceTarget.value, localeForNumber, 2)}{" "}
                {r.priceTarget.currency}
              </div>
            </div>
          )}
          {r.stopLoss && (
            <div>
              <div className="text-xs text-[var(--muted)] flex items-center gap-1">
                <Shield size={11} /> {t("stopLoss")}
              </div>
              <div className="num font-medium text-[var(--red)]">
                {fmtNumber(r.stopLoss.value, localeForNumber, 2)} {r.stopLoss.currency}
              </div>
            </div>
          )}
        </div>
      )}

      {r.rationale && (
        <p className="text-sm text-[var(--muted)] leading-relaxed">
          {r.rationale}
        </p>
      )}

      {r.risks && r.risks.length > 0 && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
            {t("risks")}
          </div>
          <ul className="text-sm space-y-1">
            {r.risks.map((risk, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--red)]">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active
          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}
