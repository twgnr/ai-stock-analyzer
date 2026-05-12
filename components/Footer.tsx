"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Footer() {
  const t = useTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border)] text-xs text-[var(--muted)] no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>{t("copyrightLine", { year })}</span>
        <Link href="/hilfe" className="hover:text-white">
          {t("help")}
        </Link>
        <Link href="/impressum" className="hover:text-white">
          {t("imprint")}
        </Link>
        <Link href="/datenschutz" className="hover:text-white">
          {t("privacy")}
        </Link>
        <Link href="/barrierefreiheit" className="hover:text-white">
          {t("accessibility")}
        </Link>
        <LanguageSwitcher variant="full" className="ml-2" />
        <span className="ml-auto text-[var(--muted)]">{t("disclaimer")}</span>
      </div>
    </footer>
  );
}
