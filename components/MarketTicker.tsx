"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { isAnyMarketOpen } from "@/lib/tradingHours";

interface TickerRow {
  label: string;
  symbol: string;
  price: number | null;
  changePct: number | null;
  suffix?: string;
  digits: number;
}

// Abgestimmt auf den 15-min-Quote-Cache in lib/yahoo.ts. Häufigeres Polling
// bringt keine neuen Werte — der Server würde nur den Cache zurückgeben.
const REFRESH_MS = 15 * 60 * 1000;

export function MarketTicker() {
  const t = useTranslations("MarketTicker");
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [hidden, setHidden] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market-ticker", { cache: "no-store" });
      if (res.status === 401) {
        setHidden(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.rows)) setRows(data.rows);
      setLoadedOnce(true);
    } catch {
      // silent — nächster Tick versucht's erneut
    }
  }, []);

  useEffect(() => {
    // Erster Load läuft immer, damit nach dem Seiten-Reload direkt Werte
    // stehen (auch wenn die Börse geschlossen ist und sich nichts ändert).
    load();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (!isAnyMarketOpen()) return;
      load();
    };
    const id = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      // Beim Wiederbesuch eines Tabs neue Daten holen — aber wieder nur,
      // wenn die Börse gerade offen ist. Sonst werden Cache-Werte ausgereicht.
      if (document.visibilityState === "visible" && isAnyMarketOpen()) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (hidden) return null;
  if (!loadedOnce || rows.length === 0) return null;

  return (
    <div
      className="border-b border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm"
      role="region"
      aria-label={t("ariaLabel")}
    >
      <div className="ticker-viewport text-xs py-1.5">
        <div className="ticker-track">
          {/* Content doppelt gerendert: sobald die erste Kopie aus dem Viewport
              geschoben wurde, steht die zweite exakt daneben — nahtloses Loop. */}
          <div className="ticker-copy">
            {rows.map((r, i) => (
              <TickerItem key={`a-${r.symbol}`} row={r} withSeparator={i > 0} />
            ))}
            <span className="text-[var(--border)] mx-3 select-none" aria-hidden="true">|</span>
          </div>
          <div className="ticker-copy" aria-hidden="true">
            {rows.map((r, i) => (
              <TickerItem key={`b-${r.symbol}`} row={r} withSeparator={i > 0} />
            ))}
            <span className="text-[var(--border)] mx-3 select-none">|</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerItem({
  row,
  withSeparator,
}: {
  row: TickerRow;
  withSeparator: boolean;
}) {
  const t = useTranslations("MarketTicker");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const tone =
    row.changePct == null || Math.abs(row.changePct) < 0.01
      ? "text-[var(--muted)]"
      : row.changePct > 0
        ? "text-[var(--green)]"
        : "text-[var(--red)]";
  const icon =
    row.changePct == null ? (
      <Minus size={10} className="inline text-[var(--muted)]" />
    ) : row.changePct >= 0 ? (
      <TrendingUp size={10} className="inline" />
    ) : (
      <TrendingDown size={10} className="inline" />
    );
  const ariaLabel =
    row.changePct != null && row.price != null
      ? t("itemAriaWithData", {
          label: row.label,
          price: fmtNumber(row.price, numberLocale, row.digits),
          change: `${row.changePct >= 0 ? "+" : ""}${fmtPercent(row.changePct)}`,
        })
      : t("itemAriaFallback", { label: row.label, symbol: row.symbol });
  return (
    <>
      {withSeparator && (
        <span className="text-[var(--border)] mx-3 select-none">|</span>
      )}
      <Link
        href={`/analysis/${encodeURIComponent(row.symbol)}`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-[var(--foreground)] transition-colors"
        aria-label={ariaLabel}
      >
        <span className="font-medium">{row.label}</span>
        <span className="num text-[var(--foreground)]">
          {row.price != null ? fmtNumber(row.price, numberLocale, row.digits) : "—"}
        </span>
        {row.changePct != null && (
          <span className={`num inline-flex items-center gap-0.5 ${tone}`}>
            {icon}
            {row.changePct >= 0 ? "+" : ""}
            {fmtPercent(row.changePct)}
          </span>
        )}
      </Link>
    </>
  );
}
