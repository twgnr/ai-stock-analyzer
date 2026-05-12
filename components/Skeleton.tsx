"use client";

/**
 * Wiederverwendbare Skeleton-Bausteine. Komponenten als reine Markup-Helper —
 * keine States, lassen sich überall einsetzen. Wegen der `sr-only`-Labels
 * brauchen die Composite-Skeletons next-intl, deshalb "use client".
 */
import { useTranslations } from "next-intl";

interface SkeletonProps {
  className?: string;
  /** Inline-Style-Override z. B. width/height. */
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function Skeleton({ className = "", style, ariaLabel }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className}`}
      style={style}
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    />
  );
}

interface TableProps {
  rows?: number;
  cols?: number;
  /** Zeigt zusätzlich eine Header-Zeile. */
  header?: boolean;
  className?: string;
}

/** Tabellen-Skeleton — typischer Einsatz in Portfolio/Watchlist/Screener. */
export function SkeletonTable({
  rows = 6,
  cols = 5,
  header = true,
  className = "",
}: TableProps) {
  const t = useTranslations("Shared.skeleton");
  return (
    <div className={`card overflow-hidden ${className}`} aria-busy="true" role="status">
      <span className="sr-only">{t("tableLoading")}</span>
      {header && (
        <div className="px-4 py-3 border-b border-[var(--border)] grid gap-3"
             style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3" />
          ))}
        </div>
      )}
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="px-4 py-3 border-b border-[var(--border)] last:border-b-0 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-4"
                style={{ width: c === 0 ? "70%" : `${60 + ((r + c) % 30)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CardListProps {
  count?: number;
  className?: string;
}

/** Stapel von Cards, z. B. für Briefing oder Insights. */
export function SkeletonCardList({ count = 3, className = "" }: CardListProps) {
  const t = useTranslations("Shared.skeleton");
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" role="status">
      <span className="sr-only">{t("contentLoading")}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <Skeleton className="h-4" style={{ width: "40%" }} />
          <Skeleton className="h-3" style={{ width: "85%" }} />
          <Skeleton className="h-3" style={{ width: "75%" }} />
          <Skeleton className="h-3" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

interface StatGridProps {
  count?: number;
  className?: string;
}

/** 2x2- oder 4er-Grid kleiner Stat-Cards. */
export function SkeletonStatGrid({ count = 4, className = "" }: StatGridProps) {
  const t = useTranslations("Shared.skeleton");
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-${count} gap-3 ${className}`}
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">{t("statsLoading")}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-3 space-y-2">
          <Skeleton className="h-3" style={{ width: "60%" }} />
          <Skeleton className="h-5" style={{ width: "40%" }} />
        </div>
      ))}
    </div>
  );
}
