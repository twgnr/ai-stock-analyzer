import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

// Die Datenschutzerklärung ist konkret auf die tatsächlichen Verarbeitungen
// dieser App zugeschnitten. Anschrift/Verantwortliche müssen vom Betreiber
// in den Platzhaltern ergänzt werden.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("metaTitle") };
}

const RIGHTS_KEYS = [
  "access",
  "rectification",
  "erasure",
  "restriction",
  "portability",
  "objection",
] as const;

const OVERVIEW_KEYS = ["auth", "portfolio", "ai", "usage", "tech"] as const;
const AI_PROVIDER_KEYS = ["anthropic", "google", "openai"] as const;

const richTags = {
  strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
};

export default async function DatenschutzPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const controllerEmail = t("sections.controller.email");

  return (
    <div className="max-w-3xl mx-auto space-y-6 text-sm leading-relaxed">
      <Link
        href="/"
        className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1 no-print"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-[var(--muted)]">
        {t("asOf", { date: new Date().toLocaleDateString(dateLocale) })}
      </p>

      {locale === "en" && (
        <p className="text-xs text-[var(--muted)] italic border-l-2 border-[var(--border)] pl-3">
          {t("translationNotice")}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.controller.heading")}</h2>
        <p>
          {t("sections.controller.intro")}
          <br />
          <span className="whitespace-pre-line">
            {t("sections.controller.addressLines")}
          </span>
          <br />
          {t("sections.controller.emailLabel")}:{" "}
          <a className="underline" href={`mailto:${controllerEmail}`}>
            {controllerEmail}
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.overview.heading")}</h2>
        <ul className="list-disc pl-5 space-y-1">
          {OVERVIEW_KEYS.map((key) => (
            <li key={key}>{t(`sections.overview.items.${key}`)}</li>
          ))}
        </ul>
        <p>{t("sections.overview.footer")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.registration.heading")}</h2>
        <p>{t("sections.registration.body")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.cookie.heading")}</h2>
        <p>{t.rich("sections.cookie.body", richTags)}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.portfolioData.heading")}</h2>
        <p>{t("sections.portfolioData.body")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.ai.heading")}</h2>
        <p>{t("sections.ai.intro")}</p>
        <ul className="list-disc pl-5 space-y-1">
          {AI_PROVIDER_KEYS.map((key) => (
            <li key={key}>{t.rich(`sections.ai.providers.${key}`, richTags)}</li>
          ))}
        </ul>
        <p>{t("sections.ai.footer")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.marketData.heading")}</h2>
        <p>{t.rich("sections.marketData.body", richTags)}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.email.heading")}</h2>
        <p>{t("sections.email.body")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.rateLimit.heading")}</h2>
        <p>{t.rich("sections.rateLimit.body", richTags)}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.hosting.heading")}</h2>
        <p>{t("sections.hosting.body")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.rights.heading")}</h2>
        <p>{t("sections.rights.intro")}</p>
        <ul className="list-disc pl-5 space-y-1">
          {RIGHTS_KEYS.map((key) => (
            <li key={key}>{t(`sections.rights.items.${key}`)}</li>
          ))}
          <li>
            {t("sections.rights.complaintBefore")}
            <a
              href="https://www.bfdi.bund.de/DE/Service/Anschriften/Laender/Laender-node.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t("sections.rights.complaintLink")}
            </a>
            {t("sections.rights.complaintAfter")}
          </li>
        </ul>
        <p>
          {t("sections.rights.selfServiceBefore")}
          <Link href="/settings" className="underline">
            {t("sections.rights.selfServiceLink")}
          </Link>
          {t("sections.rights.selfServiceAfter")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.retention.heading")}</h2>
        <p>{t("sections.retention.body")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("sections.changes.heading")}</h2>
        <p>{t("sections.changes.body")}</p>
      </section>
    </div>
  );
}
