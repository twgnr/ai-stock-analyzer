import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

// Barrierefreiheitserklärung nach BFSG (Barrierefreiheitsstärkungsgesetz),
// das seit 28.06.2025 für B2C-Online-Dienste gilt. Referenz: WCAG 2.2 AA.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Accessibility" });
  return { title: t("metaTitle") };
}

const NON_CONFORMING_KEYS = ["charts", "heatmaps", "palette", "pdf"] as const;
const MEASURE_KEYS = [
  "skipLink",
  "focus",
  "targetSize",
  "forms",
  "status",
  "tickerLinks",
  "color",
  "pageTitle",
  "contrast",
  "responsive",
  "motion",
  "lang",
] as const;

const richTags = {
  strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
};

export default async function BarrierefreiheitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Accessibility" });
  const email = t("feedbackEmail");
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

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
        <p>{t("intro")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("conformanceHeading")}</h2>
        <p>{t.rich("conformanceBody", richTags)}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("nonConformingHeading")}</h2>
        <ul className="list-disc pl-5 space-y-1">
          {NON_CONFORMING_KEYS.map((key) => (
            <li key={key}>
              <strong>{t(`nonConforming.${key}.title`)}</strong>
              {t.rich(`nonConforming.${key}.body`, richTags)}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("measuresHeading")}</h2>
        <ul className="list-disc pl-5 space-y-1">
          {MEASURE_KEYS.map((key) => (
            <li key={key}>
              {key === "lang"
                ? t.rich(`measures.${key}`, {
                    ...richTags,
                    tag: `<html lang="${locale}">`,
                  })
                : t.rich(`measures.${key}`, richTags)}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("feedbackHeading")}</h2>
        <p>{t("feedbackBody")}</p>
        <p>
          {t("feedbackEmailLabel")}:{" "}
          <a className="underline" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("enforcementHeading")}</h2>
        <p>
          {t("enforcementBefore")}
          <a
            href="https://www.bundesfachstelle-barrierefreiheit.de/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t("enforcementLink")}
          </a>
          {t("enforcementAfter")}
        </p>
      </section>
    </div>
  );
}
