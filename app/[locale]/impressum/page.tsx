import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

// Diese Seite erfüllt die Anbieterkennzeichnung gem. § 5 DDG (vormals TMG)
// und § 18 MStV. Vor dem Livegang müssen die Platzhalter durch die
// tatsächlichen Daten des Anbieters ersetzt werden.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Imprint" });
  return { title: t("metaTitle") };
}

export default async function ImpressumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Imprint" });
  const email = t("contactEmail");

  return (
    <div className="max-w-3xl mx-auto space-y-6 text-sm leading-relaxed">
      <Link
        href="/"
        className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1 no-print"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {locale === "en" && (
        <p className="text-xs text-[var(--muted)] italic border-l-2 border-[var(--border)] pl-3">
          {t("translationNotice")}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("providerHeading")}</h2>
        <p className="whitespace-pre-line">{t("providerLines")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("contactHeading")}</h2>
        <p>
          {t("contactPhoneLabel")}: {t("contactPhoneValue")}
          <br />
          {t("contactEmailLabel")}:{" "}
          <a className="underline" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("vatHeading")}</h2>
        <p className="whitespace-pre-line">{t("vatBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("editorialHeading")}</h2>
        <p className="whitespace-pre-line">{t("editorialLines")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("odrHeading")}</h2>
        <p>
          {t("odrBefore")}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          {t("odrAfter")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("consumerHeading")}</h2>
        <p>{t("consumerBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("disclaimerHeading")}</h2>
        <p>
          {t.rich("disclaimerBody", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </section>
    </div>
  );
}
