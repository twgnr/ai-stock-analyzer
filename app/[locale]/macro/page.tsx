"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  Globe2,
  Activity,
  LineChart as LineIcon,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtNumber, fmtPercent, fmtCurrency } from "@/lib/format";

interface YieldPoint {
  label: string;
  symbol: string;
  maturityYears: number;
  yield: number | null;
  change: number | null;
}

interface SectorQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

interface SentimentQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  currency?: string;
  interpretation?: string;
}

interface Payload {
  timestamp: string;
  yieldCurve: {
    points: YieldPoint[];
    spread10y3m: number | null;
    spread10y5y: number | null;
    curveInverted: boolean;
  };
  sectors: SectorQuote[];
  sentiment: SentimentQuote[];
}

export default function MacroPage() {
  const t = useTranslations("Macro.overview");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/macro");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("errorGeneric"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("back")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Globe2 size={22} className="text-[var(--accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <button onClick={load} disabled={loading} className="btn text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {t("reload")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      )}

      {data && (
        <>
          <YieldCurveCard data={data.yieldCurve} />
          <SentimentCard items={data.sentiment} />
          <SectorHeatmap sectors={data.sectors} />
        </>
      )}
    </div>
  );
}

function YieldCurveCard({ data }: { data: Payload["yieldCurve"] }) {
  const t = useTranslations("Macro.overview.yieldCurve");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <LineIcon size={16} className="text-[var(--accent)]" aria-hidden="true" />
        {t("title")}
      </h2>

      <div className="grid grid-cols-4 gap-2">
        {data.points.map((p) => (
          <div key={p.symbol} className="border border-[var(--border)] rounded p-2">
            <div className="text-xs text-[var(--muted)]">{p.label}</div>
            <div className="text-xl num font-semibold">
              {p.yield != null ? `${fmtNumber(p.yield, numberLocale, 2)}%` : "—"}
            </div>
            {p.change != null && (
              <div
                className={`text-[10px] num ${
                  p.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {p.change > 0 ? "+" : ""}
                {fmtPercent(p.change, numberLocale)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
        <div>
          <div className="text-xs text-[var(--muted)]">{t("spread10y3m")}</div>
          <div
            className={`num font-semibold ${
              data.spread10y3m == null
                ? ""
                : data.spread10y3m < 0
                  ? "text-[var(--red)]"
                  : "text-[var(--green)]"
            }`}
          >
            {data.spread10y3m != null
              ? `${data.spread10y3m > 0 ? "+" : ""}${fmtNumber(data.spread10y3m, numberLocale, 2)}%`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">{t("status")}</div>
          <div
            className={`num font-semibold ${
              data.curveInverted ? "text-[var(--red)]" : "text-[var(--green)]"
            }`}
          >
            {data.curveInverted ? t("inverted") : t("normal")}
          </div>
        </div>
      </div>
    </div>
  );
}

function SentimentCard({ items }: { items: SentimentQuote[] }) {
  const t = useTranslations("Macro.overview.sentiment");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        <Activity size={16} className="text-[var(--accent)]" aria-hidden="true" />
        {t("title")}
      </h2>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((s) => (
          <div key={s.symbol} className="border border-[var(--border)] rounded p-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--muted)]">{s.label}</div>
              {s.changePercent != null && (
                <span
                  className={`text-[10px] num inline-flex items-center gap-0.5 ${
                    s.changePercent >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}
                >
                  {s.changePercent >= 0 ? (
                    <TrendingUp size={10} aria-hidden="true" />
                  ) : (
                    <TrendingDown size={10} aria-hidden="true" />
                  )}
                  {s.changePercent > 0 ? "+" : ""}
                  {fmtPercent(s.changePercent, numberLocale)}
                </span>
              )}
            </div>
            <div className="text-lg num font-semibold">
              {s.price != null
                ? s.currency
                  ? fmtCurrency(s.price, s.currency, numberLocale)
                  : fmtNumber(s.price, numberLocale, 2)
                : "—"}
            </div>
            {s.interpretation && (
              <div className="text-[10px] text-[var(--muted)] mt-1">{s.interpretation}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorHeatmap({ sectors }: { sectors: SectorQuote[] }) {
  const t = useTranslations("Macro.overview.sectors");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">{t("title")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sectors.map((s) => {
          const pct = s.changePercent ?? 0;
          const intensity = Math.min(1, Math.abs(pct) / 3); // Skala: ±3% = Vollton
          const bgColor =
            pct >= 0
              ? `rgba(34, 197, 94, ${intensity * 0.4})`
              : `rgba(239, 68, 68, ${intensity * 0.4})`;
          const borderColor = pct >= 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
          return (
            <div
              key={s.symbol}
              className="rounded p-3 border"
              style={{ backgroundColor: bgColor, borderColor }}
            >
              <div className="text-xs text-[var(--muted)]">{s.label}</div>
              <div className="text-sm font-medium">{s.symbol}</div>
              <div
                className={`num font-semibold ${
                  pct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {pct > 0 ? "+" : ""}
                {fmtPercent(pct, numberLocale)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-[var(--muted)]">
        {t("intensityNote")}
      </div>
    </div>
  );
}
