"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Sparkline } from "@/components/Sparkline";
import { fmtPercent, changeClass } from "@/lib/format";

interface PreviewData {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  currency: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketCap?: number;
  peRatio?: number | null;
  dividendYield?: number | null;
  sector?: string | null;
  closes: number[];
  topNews?: { title: string; publisher: string; publishedAt: string };
  asOf: number;
}

interface Props {
  ticker: string;
  children?: React.ReactNode;
  className?: string;
}

const ENTER_DELAY_MS = 220;
const LEAVE_GRACE_MS = 120;

const previewCache = new Map<string, { at: number; data: PreviewData }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Drop-in-Ersatz für `<Link href="/analysis/{ticker}">`. Beim Hover/Focus zeigt
 * sich nach kurzer Verzögerung eine kleine Preview-Card mit Mini-Chart, Quote,
 * P/E, Sektor und letzter News. Auf Touch-Geräten ohne Hover bleibt es ein
 * normaler Link — kein UX-Regression-Risiko.
 */
export function TickerLink({ ticker, children, className }: Props) {
  const t = useTranslations("TickerLink");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const upperTicker = ticker.toUpperCase();

  function clearTimers() {
    if (enterTimer.current) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function load() {
    if (data) return;
    const cached = previewCache.get(upperTicker);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setData(cached.data);
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(false);
    fetch(`/api/stocks/preview?ticker=${encodeURIComponent(upperTicker)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("preview-fetch failed");
        return r.json();
      })
      .then((d: PreviewData) => {
        previewCache.set(upperTicker, { at: Date.now(), data: d });
        setData(d);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  function startOpen() {
    clearTimers();
    enterTimer.current = window.setTimeout(() => {
      setOpen(true);
      load();
    }, ENTER_DELAY_MS);
  }

  function startClose() {
    clearTimers();
    leaveTimer.current = window.setTimeout(() => setOpen(false), LEAVE_GRACE_MS);
  }

  useEffect(() => () => clearTimers(), []);

  return (
    <span
      className={`relative inline-flex ${className || ""}`}
      onMouseEnter={startOpen}
      onMouseLeave={startClose}
      onFocus={() => {
        setOpen(true);
        load();
      }}
      onBlur={() => setOpen(false)}
    >
      <Link
        href={`/analysis/${encodeURIComponent(upperTicker)}`}
        className="inline-flex"
      >
        {children ?? upperTicker}
      </Link>
      {open && (
        <span
          role="tooltip"
          onMouseEnter={() => clearTimers()}
          onMouseLeave={startClose}
          className="absolute left-0 top-full mt-1.5 z-50 w-72 card p-3 shadow-xl text-xs space-y-2 cursor-default"
          // span statt div, damit der Wrapper inline bleibt — der Inhalt wird
          // per Klassen wie ein Block-Element layoutet (display ist im card-
          // Style nicht gesetzt, aber die Children-Layouts greifen).
          style={{ display: "block" }}
        >
          {loading && !data && (
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <span className="spinner" /> {t("loading", { ticker: upperTicker })}
            </div>
          )}
          {error && !data && (
            <div className="text-[var(--red)]">
              {t("previewUnavailable", { ticker: upperTicker })}
            </div>
          )}
          {data && <PreviewCardContent data={data} />}
        </span>
      )}
    </span>
  );
}

function PreviewCardContent({ data }: { data: PreviewData }) {
  const t = useTranslations("TickerLink");
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{data.ticker}</div>
          <div className="text-[var(--muted)] truncate">{data.name}</div>
        </div>
        <div className="text-right">
          <div className="num font-semibold">
            {data.price.toFixed(2)} {data.currency}
          </div>
          <div className={`num ${changeClass(data.changePercent)}`}>
            {fmtPercent(data.changePercent)}
          </div>
        </div>
      </div>

      {data.closes.length > 1 && (
        <div className="flex justify-center pt-1">
          <Sparkline data={data.closes} width={250} height={40} />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[var(--muted)]">
        {data.peRatio != null && (
          <KV k="P/E" v={data.peRatio.toFixed(2)} />
        )}
        {data.dividendYield != null && (
          <KV k={t("dividendYield")} v={`${(data.dividendYield * 100).toFixed(2)}%`} />
        )}
        {data.fiftyTwoWeekHigh != null && data.fiftyTwoWeekLow != null && (
          <KV
            k={t("range52W")}
            v={`${data.fiftyTwoWeekLow.toFixed(0)}–${data.fiftyTwoWeekHigh.toFixed(0)}`}
          />
        )}
        {data.sector && <KV k={t("sector")} v={data.sector} />}
      </dl>

      {data.topNews && (
        <div className="pt-2 border-t border-[var(--border)] space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {t("latestNews")}
          </div>
          <div className="text-[var(--foreground)] line-clamp-2">{data.topNews.title}</div>
          <div className="text-[10px] text-[var(--muted)]">
            {data.topNews.publisher} · {data.topNews.publishedAt.slice(0, 10)}
          </div>
        </div>
      )}
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider">{k}</dt>
      <dd className="num text-[var(--foreground)] text-right">{v}</dd>
    </>
  );
}
