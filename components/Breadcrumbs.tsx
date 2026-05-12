"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Liste der bekannten Pfad-Segmente. Die Anzeige-Labels kommen über
 * useTranslations("Breadcrumbs.segments") aus dem aktuellen Locale.
 * Segmente, die hier nicht gelistet sind, werden automatisch dezapitalisiert
 * oder unverändert übernommen (z. B. Ticker).
 */
const KNOWN_SEGMENTS = new Set([
  "portfolio",
  "watchlist",
  "insights",
  "alerts",
  "analysis",
  "briefing",
  "calendar",
  "chat",
  "discoveries",
  "dividends",
  "dividends-calendar",
  "glossar",
  "hilfe",
  "macro",
  "macro-scenario",
  "magazine",
  "market",
  "news-digest",
  "peer-compare",
  "rebalance",
  "screener",
  "breakout",
  "strategien",
  "tax-report",
  "thesen",
  "transactions",
  "settings",
  "admin",
  "track-record",
  "history",
  "community",
  "metrics",
  "correlations",
  "health",
  "risk",
  "report",
  "import",
]);

interface Crumb {
  label: string;
  href: string | null;
}

/**
 * Auto-Breadcrumbs aus dem aktuellen Pathname. Renders nur auf Pages mit
 * Tiefe ≥ 2 (also `/portfolio/correlations`, `/insights/track-record`,
 * `/analysis/AAPL`, …). Auf den Top-Level-Pages wäre die Krümel-Reihe nur
 * Rauschen — daher dort `null` zurückgeben.
 */
export function Breadcrumbs() {
  const t = useTranslations("Breadcrumbs");
  const pathname = usePathname();

  function labelFor(segment: string, fullPath: string): string {
    const decoded = decodeURIComponent(segment);
    // Tickers (z. B. /analysis/AAPL): ALL-UPPER → so behalten
    if (/^[A-Z0-9.\-]{1,12}$/.test(decoded)) return decoded;
    // Spezialfälle: /dividends/screener (statt generisches "screener")
    if (decoded === "screener" && fullPath.startsWith("/dividends/")) {
      return t("segments.screener_div");
    }
    if (KNOWN_SEGMENTS.has(decoded)) {
      return t(`segments.${decoded}` as never);
    }
    // Fallback: Bindestriche zu Leerzeichen, Capitalize.
    return decoded
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!pathname || pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const crumbs: Crumb[] = [];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    acc += "/" + segments[i];
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: labelFor(segments[i], pathname),
      href: isLast ? null : acc,
    });
  }

  return (
    <nav aria-label={t("ariaLabel")} className="text-xs text-[var(--muted)]">
      <ol className="flex items-center gap-1 flex-wrap">
        <li className="inline-flex items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
            aria-label={t("dashboardAria")}
          >
            <Home size={11} aria-hidden="true" />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={11} aria-hidden="true" className="opacity-60" />
            {c.href ? (
              <Link
                href={c.href}
                className="hover:text-[var(--foreground)] transition-colors"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className="text-[var(--foreground)] font-medium"
                aria-current="page"
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
