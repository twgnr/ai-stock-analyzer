"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

// Pfad → Translation-Key in `PageTitle`. Der `— AI Stock Analyzer`-Suffix wird
// automatisch über `withSuffix` angehängt. Dynamische Segmente (z.B.
// /analysis/AAPL) erben den Präfix-Eintrag. So erfüllen wir WCAG 2.4.2
// Page Titled, ohne jede Seite einzeln anzufassen; Client-Komponenten können
// zusätzlich den usePageTitle-Hook verwenden, um einen ticker-spezifischen
// Titel zu setzen.
const TITLES: Array<{ match: RegExp; key: string }> = [
  { match: /^\/$/, key: "dashboard" },
  { match: /^\/portfolio\/import$/, key: "brokerImport" },
  { match: /^\/portfolio\/report$/, key: "portfolioReport" },
  { match: /^\/portfolio\/metrics$/, key: "portfolioMetrics" },
  { match: /^\/portfolio\/correlations$/, key: "portfolioCorrelations" },
  { match: /^\/portfolio\/risk$/, key: "portfolioRisk" },
  { match: /^\/portfolio\/health$/, key: "portfolioHealth" },
  { match: /^\/portfolio/, key: "portfolio" },
  { match: /^\/watchlist\/community$/, key: "watchlistCommunity" },
  { match: /^\/watchlist\/shared\//, key: "watchlistShared" },
  { match: /^\/watchlist/, key: "watchlist" },
  { match: /^\/transactions/, key: "transactions" },
  { match: /^\/dividends\/screener$/, key: "dividendsScreener" },
  { match: /^\/dividends-calendar/, key: "dividendsCalendar" },
  { match: /^\/dividends/, key: "dividends" },
  { match: /^\/calendar/, key: "earningsCalendar" },
  { match: /^\/alerts\/history/, key: "alertsHistory" },
  { match: /^\/alerts/, key: "alerts" },
  { match: /^\/screener/, key: "screener" },
  { match: /^\/breakout/, key: "breakout" },
  { match: /^\/discoveries/, key: "discoveries" },
  { match: /^\/peer-compare/, key: "peerCompare" },
  { match: /^\/market/, key: "market" },
  { match: /^\/magazine\//, key: "magazineDetail" },
  { match: /^\/magazine/, key: "magazine" },
  { match: /^\/news-digest\//, key: "newsDigestDetail" },
  { match: /^\/news-digest/, key: "newsDigest" },
  { match: /^\/rebalance/, key: "rebalance" },
  { match: /^\/backtest/, key: "backtest" },
  { match: /^\/tax-report/, key: "taxReport" },
  { match: /^\/insights/, key: "insights" },
  { match: /^\/chat/, key: "chat" },
  { match: /^\/analysis\//, key: "analysis" },
  { match: /^\/settings/, key: "settings" },
  { match: /^\/admin/, key: "admin" },
  { match: /^\/login/, key: "login" },
  { match: /^\/register/, key: "register" },
  { match: /^\/forgot-password/, key: "forgotPassword" },
  { match: /^\/reset-password/, key: "resetPassword" },
  { match: /^\/verify-email/, key: "verifyEmail" },
  { match: /^\/impressum/, key: "impressum" },
  { match: /^\/datenschutz/, key: "datenschutz" },
  { match: /^\/barrierefreiheit/, key: "barrierefreiheit" },
  { match: /^\/hilfe/, key: "hilfe" },
  { match: /^\/glossar/, key: "glossar" },
  { match: /^\/strategien/, key: "strategien" },
  { match: /^\/macro/, key: "macro" },
  { match: /^\/thesen/, key: "thesen" },
  { match: /^\/briefing/, key: "briefing" },
];

export function PageTitleUpdater() {
  const t = useTranslations("PageTitle");
  const pathname = usePathname();
  useEffect(() => {
    const hit = TITLES.find((entry) => entry.match.test(pathname));
    document.title = hit
      ? t("withSuffix", { title: t(hit.key as never) })
      : t("default");
  }, [pathname, t]);
  return null;
}
