import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, HelpCircle, BookOpen, Key, ExternalLink } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Help.page" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

// Reihenfolge & IDs der Sektionen — sprachunabhängig, damit Deep-Links auf
// #abschnitt-foo über alle Locales hinweg funktionieren.
const SECTION_IDS = [
  "erste-schritte",
  "dashboard",
  "menue-uebersicht",
  "portfolio",
  "watchlist",
  "alerts",
  "aktien-detail",
  "notizen",
  "markt",
  "dividenden",
  "aktien-finden",
  "themen-baskets",
  "ki-analysen",
  "inhalte",
  "api-keys",
  "datenquellen",
  "konto",
  "sicherheit",
  "support",
] as const;

// Stichwortverzeichnis: ID-Liste mit Anker. Die anzeigbaren Begriffe stammen
// aus den Translations (page.index.*).
const INDEX_ENTRIES: Array<{ key: string; href: string }> = [
  { key: "twofa", href: "#sicherheit" },
  { key: "detailPage", href: "#aktien-detail" },
  { key: "findStocks", href: "#aktien-finden" },
  { key: "alerts", href: "#alerts" },
  { key: "alertHistory", href: "#alerts" },
  { key: "anthropic", href: "#api-key-claude" },
  { key: "apiKeys", href: "#api-keys" },
  { key: "backtest", href: "#ki-analysen" },
  { key: "accessibility", href: "/barrierefreiheit" },
  { key: "relations", href: "#aktien-detail" },
  { key: "breakout", href: "#aktien-finden" },
  { key: "brokerImport", href: "#portfolio" },
  { key: "bullBear", href: "#aktien-detail" },
  { key: "chart", href: "#aktien-detail" },
  { key: "chat", href: "#ki-analysen" },
  { key: "claude", href: "#api-key-claude" },
  { key: "community", href: "#watchlist" },
  { key: "conviction", href: "#watchlist" },
  { key: "csv", href: "#portfolio" },
  { key: "data", href: "#datenquellen" },
  { key: "dataExport", href: "#konto" },
  { key: "privacy", href: "/datenschutz" },
  { key: "dcf", href: "#aktien-detail" },
  { key: "dividends", href: "#dividenden" },
  { key: "divCalendar", href: "#dividenden" },
  { key: "divScreener", href: "#dividenden" },
  { key: "gdpr", href: "#konto" },
  { key: "earningsCal", href: "#markt" },
  { key: "earnings", href: "#aktien-detail" },
  { key: "discoveries", href: "#aktien-finden" },
  { key: "first", href: "#erste-schritte" },
  { key: "support", href: "#support" },
  { key: "fundamentals", href: "#aktien-detail" },
  { key: "gemini", href: "#api-key-gemini" },
  { key: "glossary", href: "#inhalte" },
  { key: "aistudio", href: "#api-key-gemini" },
  { key: "trends", href: "#aktien-detail" },
  { key: "groq", href: "#api-key-groq" },
  { key: "helpMode", href: "#inhalte" },
  { key: "imprint", href: "/impressum" },
  { key: "insider", href: "#aktien-detail" },
  { key: "insights", href: "#ki-analysen" },
  { key: "thesen", href: "#ki-analysen" },
  { key: "calendar", href: "#markt" },
  { key: "ai", href: "#ki-analysen" },
  { key: "aiTrack", href: "#ki-analysen" },
  { key: "contact", href: "#support" },
  { key: "deleteAccount", href: "#konto" },
  { key: "correlation", href: "#portfolio" },
  { key: "freshness", href: "#datenquellen" },
  { key: "liveUpdate", href: "#datenquellen" },
  { key: "macroScenario", href: "#markt" },
  { key: "macro", href: "#markt" },
  { key: "marketRadar", href: "#markt" },
  { key: "menu", href: "#menue-uebersicht" },
  { key: "movers", href: "#markt" },
  { key: "digest", href: "#ki-analysen" },
  { key: "notes", href: "#notizen" },
  { key: "openai", href: "#api-key-openai" },
  { key: "resetPwd", href: "#sicherheit" },
  { key: "peer", href: "#aktien-finden" },
  { key: "metrics", href: "#portfolio" },
  { key: "portfolio", href: "#portfolio" },
  { key: "health", href: "#portfolio" },
  { key: "report", href: "#portfolio" },
  { key: "sizing", href: "#aktien-detail" },
  { key: "priceAlerts", href: "#alerts" },
  { key: "proScores", href: "#aktien-detail" },
  { key: "providerChoice", href: "#api-keys" },
  { key: "rebalance", href: "#portfolio" },
  { key: "reddit", href: "#aktien-detail" },
  { key: "risk", href: "#portfolio" },
  { key: "screener", href: "#aktien-finden" },
  { key: "security", href: "#sicherheit" },
  { key: "tax", href: "#portfolio" },
  { key: "strategies", href: "#inhalte" },
  { key: "themes", href: "#themen-baskets" },
  { key: "top10", href: "#markt" },
  { key: "trackRecord", href: "#ki-analysen" },
  { key: "transactions", href: "#portfolio" },
  { key: "watchlist", href: "#watchlist" },
  { key: "wikipedia", href: "#aktien-detail" },
  { key: "briefing", href: "#ki-analysen" },
  { key: "xai", href: "#api-keys" },
  { key: "magazine", href: "#ki-analysen" },
  { key: "credentials", href: "#api-keys" },
];

const richTags = {
  strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  em: (chunks: React.ReactNode) => <em>{chunks}</em>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
};

const linkClass = "underline hover:text-white";

export default async function HilfePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Help.page" });

  const sortedIndex = [...INDEX_ENTRIES]
    .map((e) => ({ ...e, term: t(`index.${e.key}`) }))
    .sort((a, b) => a.term.localeCompare(b.term, locale, { sensitivity: "base" }));

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-sm leading-relaxed">
      <Link
        href="/"
        className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1 no-print"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("back")}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircle size={22} className="text-[var(--accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <p className="text-[var(--muted)]">{t("intro")}</p>
      </header>

      <nav aria-labelledby="toc-heading" className="card p-4 space-y-2">
        <h2 id="toc-heading" className="font-semibold flex items-center gap-2">
          <BookOpen size={16} aria-hidden="true" /> {t("tocHeading")}
        </h2>
        <ol className="list-decimal pl-5 grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {SECTION_IDS.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-white underline-offset-2 hover:underline">
                {t(`sectionTitles.${id}`)}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#stichwortverzeichnis"
              className="hover:text-white underline-offset-2 hover:underline"
            >
              {t("indexTitle")}
            </a>
          </li>
        </ol>
      </nav>

      {/* ---------------- Erste Schritte ---------------- */}
      <section id="erste-schritte" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("ersteSchritte.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("ersteSchritte.purposeH3")}</h3>
        <p>{t.rich("ersteSchritte.purposeP", richTags)}</p>

        <h3 className="font-semibold mt-4">{t("ersteSchritte.audienceH3")}</h3>
        <p>
          {t("ersteSchritte.audienceBefore")}
          <Link href="/glossar" className={linkClass}>
            {t("ersteSchritte.audienceLink")}
          </Link>
          {t("ersteSchritte.audienceAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ersteSchritte.orderH3")}</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            {t("ersteSchritte.step1Before")}
            <Link href="/register" className={linkClass}>
              {t("ersteSchritte.step1Link")}
            </Link>
            {t("ersteSchritte.step1After")}
          </li>
          <li>
            {t("ersteSchritte.step2Before")}
            <Link href="/settings" className={linkClass}>
              {t("ersteSchritte.step2Link")}
            </Link>
            {t("ersteSchritte.step2Middle")}
            <a href="#api-keys" className={linkClass}>
              {t("ersteSchritte.step2Anchor")}
            </a>
            {t("ersteSchritte.step2After")}
          </li>
          <li>
            {t("ersteSchritte.step3Before")}
            <Link href="/portfolio" className={linkClass}>
              {t("ersteSchritte.step3Link")}
            </Link>
            {t("ersteSchritte.step3After")}
          </li>
          <li>
            {t("ersteSchritte.step4Before")}
            <Link href="/watchlist" className={linkClass}>
              {t("ersteSchritte.step4Link")}
            </Link>
            {t("ersteSchritte.step4Middle")}
            <Link href="/insights" className={linkClass}>
              {t("ersteSchritte.step4Link2")}
            </Link>
            {t("ersteSchritte.step4After")}
          </li>
        </ol>

        <h3 className="font-semibold mt-4">{t("ersteSchritte.needKeyH3")}</h3>
        <p>{t("ersteSchritte.needKeyP")}</p>

        <h3 className="font-semibold mt-4">{t("ersteSchritte.currencyH3")}</h3>
        <p>{t("ersteSchritte.currencyP")}</p>
      </section>

      {/* ---------------- Dashboard ---------------- */}
      <section id="dashboard" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("dashboard.h2")}</h2>
        <p>
          {t("dashboard.introBefore")}
          <Link href="/" className={linkClass}>
            {t("dashboard.introLink")}
          </Link>
          {t("dashboard.introAfter")}
        </p>
        <p>{t("dashboard.listIntro")}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("dashboard.item1", richTags)}</li>
          <li>{t.rich("dashboard.item2", richTags)}</li>
          <li>{t.rich("dashboard.item3", richTags)}</li>
          <li>{t.rich("dashboard.item4", richTags)}</li>
          <li>{t.rich("dashboard.item5", richTags)}</li>
          <li>{t.rich("dashboard.item6", richTags)}</li>
          <li>{t.rich("dashboard.item7", richTags)}</li>
        </ul>
        <p>{t("dashboard.footer")}</p>
      </section>

      {/* ---------------- Menü ---------------- */}
      <section id="menue-uebersicht" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("menu.h2")}</h2>
        <p>{t.rich("menu.intro", richTags)}</p>

        <h3 className="font-semibold mt-4">{t("menu.tradesHeading")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>
              <Link href="/portfolio" className={linkClass}>
                {t("menu.portfolioLink")}
              </Link>
            </strong>
            {t("menu.portfolioAfter")}
          </li>
          <li>
            <strong>
              <Link href="/transactions" className={linkClass}>
                {t("menu.transactionsLink")}
              </Link>
            </strong>
            {t("menu.transactionsAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/import" className={linkClass}>
                {t("menu.importLink")}
              </Link>
            </strong>
            {t("menu.importAfter")}
          </li>
          <li>
            <strong>
              <Link href="/rebalance" className={linkClass}>
                {t("menu.rebalanceLink")}
              </Link>
            </strong>
            {t("menu.rebalanceAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/risk" className={linkClass}>
                {t("menu.riskLink")}
              </Link>
            </strong>
            {t("menu.riskAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/health" className={linkClass}>
                {t("menu.healthLink")}
              </Link>
            </strong>
            {t("menu.healthAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/metrics" className={linkClass}>
                {t("menu.metricsLink")}
              </Link>
            </strong>
            {t("menu.metricsAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/correlations" className={linkClass}>
                {t("menu.correlLink")}
              </Link>
            </strong>
            {t("menu.correlAfter")}
          </li>
          <li>
            <strong>
              <Link href="/portfolio/report" className={linkClass}>
                {t("menu.reportLink")}
              </Link>
            </strong>
            {t("menu.reportAfter")}
          </li>
          <li>
            <strong>
              <Link href="/tax-report" className={linkClass}>
                {t("menu.taxLink")}
              </Link>
            </strong>
            {t("menu.taxAfter")}
          </li>
          <li>
            <strong>
              <Link href="/alerts" className={linkClass}>
                {t("menu.alertsLink")}
              </Link>
            </strong>
            {t("menu.alertsAfter")}
          </li>
        </ul>

        <h3 className="font-semibold mt-4">{t("menu.marketHeading")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>
              <Link href="/watchlist" className={linkClass}>
                {t("menu.watchlistLink")}
              </Link>
            </strong>
            {t("menu.watchlistAfter")}
          </li>
          <li>
            <strong>
              <Link href="/watchlist/community" className={linkClass}>
                {t("menu.communityLink")}
              </Link>
            </strong>
            {t("menu.communityAfter")}
          </li>
          <li>
            <strong>
              <Link href="/dividends" className={linkClass}>
                {t("menu.dividendsLink")}
              </Link>
            </strong>
            {t("menu.dividendsAfter")}
          </li>
          <li>
            <strong>
              <Link href="/dividends-calendar" className={linkClass}>
                {t("menu.divCalLink")}
              </Link>
            </strong>
            {t("menu.divCalAfter")}
          </li>
          <li>
            <strong>
              <Link href="/calendar" className={linkClass}>
                {t("menu.calLink")}
              </Link>
            </strong>
            {t("menu.calAfter")}
          </li>
          <li>
            <strong>
              <Link href="/market" className={linkClass}>
                {t("menu.marketLink")}
              </Link>
            </strong>
            {t("menu.marketAfter")}
          </li>
          <li>
            <strong>
              <Link href="/macro" className={linkClass}>
                {t("menu.macroLink")}
              </Link>
            </strong>
            {t("menu.macroAfter")}
          </li>
          <li>
            <strong>
              <Link href="/macro-scenario" className={linkClass}>
                {t("menu.macroScenarioLink")}
              </Link>
            </strong>
            {t("menu.macroScenarioAfter")}
          </li>
        </ul>

        <h3 className="font-semibold mt-4">{t("menu.aiHeading")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>
              <Link href="/insights" className={linkClass}>
                {t("menu.insightsLink")}
              </Link>
            </strong>
            {t("menu.insightsAfter")}
          </li>
          <li>
            <strong>
              <Link href="/chat" className={linkClass}>
                {t("menu.chatLink")}
              </Link>
            </strong>
            {t("menu.chatAfter")}
          </li>
          <li>
            <strong>
              <Link href="/screener" className={linkClass}>
                {t("menu.screenerLink")}
              </Link>
            </strong>
            {t("menu.screenerAfter")}
          </li>
          <li>
            <strong>
              <Link href="/breakout" className={linkClass}>
                {t("menu.breakoutLink")}
              </Link>
            </strong>
            {t("menu.breakoutAfter")}
          </li>
          <li>
            <strong>
              <Link href="/discoveries" className={linkClass}>
                {t("menu.discoveriesLink")}
              </Link>
            </strong>
            {t("menu.discoveriesAfter")}
          </li>
          <li>
            <strong>
              <Link href="/peer-compare" className={linkClass}>
                {t("menu.peerLink")}
              </Link>
            </strong>
            {t("menu.peerAfter")}
          </li>
          <li>
            <strong>
              <Link href="/themes" className={linkClass}>
                {t("menu.themesLink")}
              </Link>
            </strong>
            {t("menu.themesAfter")}
          </li>
          <li>
            <strong>
              <Link href="/news-digest" className={linkClass}>
                {t("menu.digestLink")}
              </Link>
            </strong>
            {t("menu.digestAfter")}
          </li>
          <li>
            <strong>
              <Link href="/insights/track-record" className={linkClass}>
                {t("menu.trackLink")}
              </Link>
            </strong>
            {t("menu.trackAfter")}
          </li>
          <li>
            <strong>
              <Link href="/backtest" className={linkClass}>
                {t("menu.backtestLink")}
              </Link>
            </strong>
            {t("menu.backtestAfter")}
          </li>
        </ul>

        <h3 className="font-semibold mt-4">{t("menu.contentHeading")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>
              <Link href="/magazine" className={linkClass}>
                {t("menu.magazineLink")}
              </Link>
            </strong>
            {t("menu.magazineAfter")}
          </li>
          <li>
            <strong>
              <Link href="/thesen" className={linkClass}>
                {t("menu.thesenLink")}
              </Link>
            </strong>
            {t("menu.thesenAfter")}
          </li>
          <li>
            <strong>
              <Link href="/briefing" className={linkClass}>
                {t("menu.briefingLink")}
              </Link>
            </strong>
            {t("menu.briefingAfter")}
          </li>
          <li>
            <strong>
              <Link href="/strategien" className={linkClass}>
                {t("menu.strategiesLink")}
              </Link>
            </strong>
            {t("menu.strategiesAfter")}
          </li>
          <li>
            <strong>
              <Link href="/glossar" className={linkClass}>
                {t("menu.glossaryLink")}
              </Link>
            </strong>
            {t("menu.glossaryAfter")}
          </li>
          <li>{t.rich("menu.helpItem", richTags)}</li>
        </ul>
      </section>

      {/* ---------------- Portfolio ---------------- */}
      <section id="portfolio" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("portfolioSection.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("portfolioSection.overviewH3")}</h3>
        <p>
          {t("portfolioSection.overviewBefore")}
          <Link href="/portfolio" className={linkClass}>
            {t("portfolioSection.overviewLink")}
          </Link>
          {t("portfolioSection.overviewAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.manualH3")}</h3>
        <p>{t("portfolioSection.manualP")}</p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.txH3")}</h3>
        <p>
          {t("portfolioSection.txBefore")}
          <Link href="/transactions" className={linkClass}>
            {t("portfolioSection.txLink")}
          </Link>
          {t.rich("portfolioSection.txAfter", richTags)}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.importH3")}</h3>
        <p>
          {t("portfolioSection.importBefore")}
          <Link href="/portfolio/import" className={linkClass}>
            {t("portfolioSection.importLink")}
          </Link>
          {t("portfolioSection.importAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.reportH3")}</h3>
        <p>
          {t("portfolioSection.reportBefore")}
          <Link href="/portfolio/report" className={linkClass}>
            {t("portfolioSection.reportLink")}
          </Link>
          {t("portfolioSection.reportAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.taxH3")}</h3>
        <p>
          {t("portfolioSection.taxBefore")}
          <Link href="/tax-report" className={linkClass}>
            {t("portfolioSection.taxLink")}
          </Link>
          {t("portfolioSection.taxAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.riskH3")}</h3>
        <p>
          {t("portfolioSection.riskBefore")}
          <Link href="/portfolio/risk" className={linkClass}>
            {t("portfolioSection.riskLink")}
          </Link>
          {t("portfolioSection.riskAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.healthH3")}</h3>
        <p>
          {t("portfolioSection.healthBefore")}
          <Link href="/portfolio/health" className={linkClass}>
            {t("portfolioSection.healthLink")}
          </Link>
          {t("portfolioSection.healthAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.metricsH3")}</h3>
        <p>
          {t("portfolioSection.metricsBefore")}
          <Link href="/portfolio/metrics" className={linkClass}>
            {t("portfolioSection.metricsLink")}
          </Link>
          {t("portfolioSection.metricsAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.correlH3")}</h3>
        <p>
          {t("portfolioSection.correlBefore")}
          <Link href="/portfolio/correlations" className={linkClass}>
            {t("portfolioSection.correlLink")}
          </Link>
          {t("portfolioSection.correlAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("portfolioSection.rebH3")}</h3>
        <p>
          {t("portfolioSection.rebBefore")}
          <Link href="/rebalance" className={linkClass}>
            {t("portfolioSection.rebLink")}
          </Link>
          {t("portfolioSection.rebAfter")}
        </p>
      </section>

      {/* ---------------- Watchlist ---------------- */}
      <section id="watchlist" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("watchlist.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("watchlist.personalH3")}</h3>
        <p>
          {t("watchlist.personalBefore")}
          <Link href="/watchlist" className={linkClass}>
            {t("watchlist.personalLink")}
          </Link>
          {t.rich("watchlist.personalAfter", richTags)}
        </p>

        <h3 className="font-semibold mt-4">{t("watchlist.communityH3")}</h3>
        <p>
          {t("watchlist.communityBefore")}
          <Link href="/watchlist/community" className={linkClass}>
            {t("watchlist.communityLink")}
          </Link>
          {t("watchlist.communityAfter")}
        </p>
      </section>

      {/* ---------------- Alerts ---------------- */}
      <section id="alerts" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("alerts.h2")}</h2>
        <p>
          {t("alerts.introBefore")}
          <Link href="/alerts" className={linkClass}>
            {t("alerts.introLink")}
          </Link>
          {t("alerts.introAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("alerts.up", richTags)}</li>
          <li>{t.rich("alerts.down", richTags)}</li>
          <li>{t.rich("alerts.indicator", richTags)}</li>
        </ul>
        <p>
          {t("alerts.fireBefore")}
          <Link href="/alerts/history" className={linkClass}>
            {t("alerts.fireLink")}
          </Link>
          {t("alerts.fireAfter")}
        </p>
        <p>{t.rich("alerts.important", richTags)}</p>
      </section>

      {/* ---------------- Aktien-Detail ---------------- */}
      <section id="aktien-detail" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("detail.h2")}</h2>
        <p>{t("detail.intro")}</p>

        <h3 className="font-semibold mt-4">{t("detail.headH3")}</h3>
        <p>{t.rich("detail.headP", richTags)}</p>

        <h3 className="font-semibold mt-4">{t("detail.chartH3")}</h3>
        <p>{t("detail.chartP")}</p>

        <h3 className="font-semibold mt-4">{t("detail.fundamentalsH3")}</h3>
        <p>{t("detail.fundamentalsP")}</p>

        <h3 className="font-semibold mt-4">{t("detail.sizingH3")}</h3>
        <p>{t("detail.sizingP")}</p>

        <h3 className="font-semibold mt-4">{t("detail.consensusH3")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("detail.consensus1", richTags)}</li>
          <li>{t.rich("detail.consensus2", richTags)}</li>
          <li>{t.rich("detail.consensus3", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("detail.proH3")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("detail.pro1", richTags)}</li>
          <li>{t.rich("detail.pro2", richTags)}</li>
          <li>{t.rich("detail.pro3", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("detail.thesisH3")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("detail.thesis1", richTags)}</li>
          <li>{t.rich("detail.thesis2", richTags)}</li>
          <li>{t.rich("detail.thesis3", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("detail.relationsH3")}</h3>
        <p>{t("detail.relationsP")}</p>

        <h3 className="font-semibold mt-4">{t("detail.attentionH3")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("detail.att1", richTags)}</li>
          <li>{t.rich("detail.att2", richTags)}</li>
          <li>{t.rich("detail.att3", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("detail.newsH3")}</h3>
        <p>{t("detail.newsP")}</p>
      </section>

      {/* ---------------- Notizen ---------------- */}
      <section id="notizen" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("notes.h2")}</h2>
        <p>{t("notes.intro")}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("notes.i1", richTags)}</li>
          <li>{t.rich("notes.i2", richTags)}</li>
          <li>{t.rich("notes.i3", richTags)}</li>
        </ul>
        <p>{t.rich("notes.footer", richTags)}</p>
      </section>

      {/* ---------------- Markt ---------------- */}
      <section id="markt" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("market.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("market.radarH3")}</h3>
        <p>
          {t("market.radarBefore")}
          <Link href="/market" className={linkClass}>
            {t("market.radarLink")}
          </Link>
          {t("market.radarAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("market.r1", richTags)}</li>
          <li>{t.rich("market.r2", richTags)}</li>
          <li>{t.rich("market.r3", richTags)}</li>
          <li>{t.rich("market.r4", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("market.macroH3")}</h3>
        <p>
          {t("market.macroBefore")}
          <Link href="/macro" className={linkClass}>
            {t("market.macroLink")}
          </Link>
          {t("market.macroAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("market.m1", richTags)}</li>
          <li>{t.rich("market.m2", richTags)}</li>
          <li>{t.rich("market.m3", richTags)}</li>
          <li>{t.rich("market.m4", richTags)}</li>
          <li>{t.rich("market.m5", richTags)}</li>
          <li>{t.rich("market.m6", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("market.scenarioH3")}</h3>
        <p>
          {t("market.scenarioBefore")}
          <Link href="/macro-scenario" className={linkClass}>
            {t("market.scenarioLink")}
          </Link>
          {t("market.scenarioAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("market.earningsH3")}</h3>
        <p>
          {t("market.earningsBefore")}
          <Link href="/calendar" className={linkClass}>
            {t("market.earningsLink")}
          </Link>
          {t("market.earningsAfter")}
        </p>
      </section>

      {/* ---------------- Dividenden ---------------- */}
      <section id="dividenden" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("dividends.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("dividends.personalH3")}</h3>
        <p>
          {t("dividends.personalBefore")}
          <Link href="/dividends" className={linkClass}>
            {t("dividends.personalLink")}
          </Link>
          {t.rich("dividends.personalAfter", richTags)}
        </p>

        <h3 className="font-semibold mt-4">{t("dividends.calendarH3")}</h3>
        <p>
          {t("dividends.calendarBefore")}
          <Link href="/dividends-calendar" className={linkClass}>
            {t("dividends.calendarLink")}
          </Link>
          {t("dividends.calendarAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("dividends.topH3")}</h3>
        <p>
          {t("dividends.topBefore")}
          <Link href="/dividends/screener" className={linkClass}>
            {t("dividends.topLink")}
          </Link>
          {t("dividends.topAfter")}
        </p>
      </section>

      {/* ---------------- Aktien finden ---------------- */}
      <section id="aktien-finden" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("find.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("find.screenerH3")}</h3>
        <p>
          {t("find.screenerBefore")}
          <Link href="/screener" className={linkClass}>
            {t("find.screenerLink")}
          </Link>
          {t("find.screenerAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("find.s1", richTags)}</li>
          <li>{t.rich("find.s2", richTags)}</li>
          <li>{t.rich("find.s3", richTags)}</li>
          <li>{t.rich("find.s4", richTags)}</li>
          <li>{t.rich("find.s5", richTags)}</li>
        </ul>
        <p>{t.rich("find.screenerFooter", richTags)}</p>

        <h3 className="font-semibold mt-4">{t("find.breakoutH3")}</h3>
        <p>
          {t("find.breakoutBefore")}
          <Link href="/breakout" className={linkClass}>
            {t("find.breakoutLink")}
          </Link>
          {t("find.breakoutAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("find.peerH3")}</h3>
        <p>
          {t("find.peerBefore")}
          <Link href="/peer-compare" className={linkClass}>
            {t("find.peerLink")}
          </Link>
          {t("find.peerAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("find.discH3")}</h3>
        <p>
          {t("find.discBefore")}
          <Link href="/discoveries" className={linkClass}>
            {t("find.discLink")}
          </Link>
          {t("find.discAfter")}
        </p>
      </section>

      {/* ---------------- Themen-Baskets ---------------- */}
      <section id="themen-baskets" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("themes.h2")}</h2>
        <p>
          <Link href="/themes" className={linkClass}>
            {t("themes.introLink")}
          </Link>
          {t("themes.introAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("themes.big", richTags)}</li>
          <li>{t.rich("themes.mid", richTags)}</li>
          <li>{t.rich("themes.small", richTags)}</li>
        </ul>
        <p>{t("themes.buckets")}</p>
        <p>{t.rich("themes.regenerate", richTags)}</p>
      </section>

      {/* ---------------- KI-Analysen ---------------- */}
      <section id="ki-analysen" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("ai.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("ai.providerH3")}</h3>
        <p>{t("ai.providerP")}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("ai.p1", richTags)}</li>
          <li>{t.rich("ai.p2", richTags)}</li>
          <li>{t.rich("ai.p3", richTags)}</li>
          <li>{t.rich("ai.p4", richTags)}</li>
        </ul>
        <p>
          {t("ai.providerFooterBefore")}
          <Link href="/settings" className={linkClass}>
            {t("ai.providerFooterLink")}
          </Link>
          {t("ai.providerFooterAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.insightsH3")}</h3>
        <p>
          {t("ai.insightsBefore")}
          <Link href="/insights" className={linkClass}>
            {t("ai.insightsLink")}
          </Link>
          {t("ai.insightsAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.chatH3")}</h3>
        <p>
          {t("ai.chatBefore")}
          <Link href="/chat" className={linkClass}>
            {t("ai.chatLink")}
          </Link>
          {t("ai.chatAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.digestH3")}</h3>
        <p>
          {t("ai.digestBefore")}
          <Link href="/news-digest" className={linkClass}>
            {t("ai.digestLink")}
          </Link>
          {t("ai.digestAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.briefingH3")}</h3>
        <p>
          {t("ai.briefingBefore")}
          <Link href="/briefing" className={linkClass}>
            {t("ai.briefingLink")}
          </Link>
          {t("ai.briefingAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.trackH3")}</h3>
        <p>
          {t("ai.trackBefore")}
          <Link href="/insights/track-record" className={linkClass}>
            {t("ai.trackLink")}
          </Link>
          {t("ai.trackAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.backtestH3")}</h3>
        <p>
          {t("ai.backtestBefore")}
          <Link href="/backtest" className={linkClass}>
            {t("ai.backtestLink")}
          </Link>
          {t("ai.backtestAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.magazineH3")}</h3>
        <p>
          {t("ai.magazineBefore")}
          <Link href="/magazine" className={linkClass}>
            {t("ai.magazineLink")}
          </Link>
          {t("ai.magazineAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("ai.thesenH3")}</h3>
        <p>
          {t("ai.thesenBefore")}
          <Link href="/thesen" className={linkClass}>
            {t("ai.thesenLink")}
          </Link>
          {t("ai.thesenAfter")}
        </p>
      </section>

      {/* ---------------- Inhalte ---------------- */}
      <section id="inhalte" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("content.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("content.stratH3")}</h3>
        <p>
          {t("content.stratBefore")}
          <Link href="/strategien" className={linkClass}>
            {t("content.stratLink")}
          </Link>
          {t("content.stratAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("content.glossH3")}</h3>
        <p>
          {t("content.glossBefore")}
          <Link href="/glossar" className={linkClass}>
            {t("content.glossLink")}
          </Link>
          {t("content.glossAfter")}
        </p>

        <h3 className="font-semibold mt-4">{t("content.modeH3")}</h3>
        <p>{t("content.modeP")}</p>
      </section>

      {/* ---------------- API-Keys ---------------- */}
      <section id="api-keys" className="space-y-4 scroll-mt-24">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Key size={18} aria-hidden="true" /> {t("apiKeys.h2")}
        </h2>
        <p>{t("apiKeys.intro")}</p>
        <div className="card p-3 text-xs text-[var(--muted)]">
          {t.rich("apiKeys.billingNotice", {
            ...richTags,
            strong: (chunks) => (
              <strong className="text-[var(--foreground)]">{chunks}</strong>
            ),
          })}
        </div>

        {/* Claude */}
        <div id="api-key-claude" className="space-y-2 scroll-mt-24">
          <h3 className="font-semibold text-lg">{t("apiKeys.claudeH3")}</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              {t("apiKeys.claude1Before")}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                {t("apiKeys.claude1Link")}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
              {t("apiKeys.claude1After")}
            </li>
            <li>{t.rich("apiKeys.claude2", richTags)}</li>
            <li>{t("apiKeys.claude3")}</li>
            <li>
              {t("apiKeys.claude4Before")}
              <Link href="/settings" className={linkClass}>
                {t("apiKeys.claude4Link")}
              </Link>
              {t.rich("apiKeys.claude4After", richTags)}
            </li>
          </ol>
        </div>

        {/* Gemini */}
        <div id="api-key-gemini" className="space-y-2 scroll-mt-24">
          <h3 className="font-semibold text-lg">{t("apiKeys.geminiH3")}</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              {t("apiKeys.gemini1Before")}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                {t("apiKeys.gemini1Link")}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
              {t("apiKeys.gemini1After")}
            </li>
            <li>{t.rich("apiKeys.gemini2", richTags)}</li>
            <li>
              {t("apiKeys.gemini3Before")}
              <Link href="/settings" className={linkClass}>
                {t("apiKeys.gemini3Link")}
              </Link>
              {t.rich("apiKeys.gemini3After", richTags)}
            </li>
          </ol>
          <p className="text-xs text-[var(--muted)]">{t("apiKeys.geminiFooter")}</p>
        </div>

        {/* Groq */}
        <div id="api-key-groq" className="space-y-2 scroll-mt-24">
          <h3 className="font-semibold text-lg">{t("apiKeys.groqH3")}</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              {t("apiKeys.groq1Before")}
              <a
                href="https://console.groq.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                {t("apiKeys.groq1Link")}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
              {t("apiKeys.groq1After")}
            </li>
            <li>{t.rich("apiKeys.groq2", richTags)}</li>
            <li>
              {t("apiKeys.groq3Before")}
              <Link href="/settings" className={linkClass}>
                {t("apiKeys.groq3Link")}
              </Link>
              {t.rich("apiKeys.groq3After", richTags)}
            </li>
          </ol>
          <p className="text-xs text-[var(--muted)]">{t("apiKeys.groqFooter")}</p>
        </div>

        {/* OpenAI */}
        <div id="api-key-openai" className="space-y-2 scroll-mt-24">
          <h3 className="font-semibold text-lg">{t("apiKeys.openaiH3")}</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              {t("apiKeys.openai1Before")}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                {t("apiKeys.openai1Link")}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
              {t("apiKeys.openai1After")}
            </li>
            <li>{t.rich("apiKeys.openai2", richTags)}</li>
            <li>{t("apiKeys.openai3")}</li>
            <li>
              {t("apiKeys.openai4Before")}
              <Link href="/settings" className={linkClass}>
                {t("apiKeys.openai4Link")}
              </Link>
              {t.rich("apiKeys.openai4After", richTags)}
            </li>
          </ol>
        </div>

        <div className="card p-3 text-xs text-[var(--muted)] mt-2">
          {t.rich("apiKeys.warning", {
            ...richTags,
            strong: (chunks) => (
              <strong className="text-[var(--foreground)]">{chunks}</strong>
            ),
          })}
        </div>
      </section>

      {/* ---------------- Datenquellen ---------------- */}
      <section id="datenquellen" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("data.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("data.freshnessH3")}</h3>
        <p>{t("data.freshnessP")}</p>

        <h3 className="font-semibold mt-4">{t("data.sourcesH3")}</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t.rich("data.s1", richTags)}</li>
          <li>{t.rich("data.s2", richTags)}</li>
          <li>{t.rich("data.s3", richTags)}</li>
          <li>{t.rich("data.s4", richTags)}</li>
          <li>{t.rich("data.s5", richTags)}</li>
          <li>{t.rich("data.s6", richTags)}</li>
          <li>{t.rich("data.s7", richTags)}</li>
        </ul>

        <h3 className="font-semibold mt-4">{t("data.fallbackH3")}</h3>
        <p>{t("data.fallbackP")}</p>
      </section>

      {/* ---------------- Konto ---------------- */}
      <section id="konto" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("account.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("account.exportH3")}</h3>
        <p>
          {t("account.exportBefore")}
          <Link href="/settings" className={linkClass}>
            {t("account.exportLink")}
          </Link>
          {t.rich("account.exportAfter", richTags)}
        </p>

        <h3 className="font-semibold mt-4">{t("account.deleteH3")}</h3>
        <p>{t("account.deleteP")}</p>

        <h3 className="font-semibold mt-4">{t("account.cookiesH3")}</h3>
        <p>{t("account.cookiesP")}</p>
      </section>

      {/* ---------------- Sicherheit ---------------- */}
      <section id="sicherheit" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("security.h2")}</h2>

        <h3 className="font-semibold mt-4">{t("security.twofaH3")}</h3>
        <p>
          {t("security.twofaBefore")}
          <Link href="/settings" className={linkClass}>
            {t("security.twofaLink")}
          </Link>
          {t.rich("security.twofaAfter", richTags)}
        </p>

        <h3 className="font-semibold mt-4">{t("security.resetH3")}</h3>
        <p>{t("security.resetP")}</p>

        <h3 className="font-semibold mt-4">{t("security.keysH3")}</h3>
        <p>{t("security.keysP")}</p>
      </section>

      {/* ---------------- Support ---------------- */}
      <section id="support" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("support.h2")}</h2>
        <p>
          {t("support.introBefore")}
          <a
            href="https://github.com/twgnr/ai_stocks_analyzer/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            {t("support.introLink")} <ExternalLink size={11} aria-hidden="true" />
          </a>
          {t("support.introAfter")}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t("support.i1")}</li>
          <li>{t("support.i2")}</li>
          <li>{t("support.i3")}</li>
          <li>{t("support.i4")}</li>
        </ul>
        <p>{t("support.outro")}</p>
      </section>

      {/* ---------------- Stichwortverzeichnis ---------------- */}
      <section id="stichwortverzeichnis" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">{t("indexTitle")}</h2>
        <p className="text-[var(--muted)]">{t("indexIntro")}</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 list-none pl-0">
          {sortedIndex.map((entry) => (
            <li key={entry.key} className="flex items-baseline gap-2">
              <span aria-hidden="true" className="text-[var(--muted)]">›</span>
              <a
                href={entry.href}
                className="hover:text-white underline-offset-2 hover:underline"
              >
                {entry.term}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
