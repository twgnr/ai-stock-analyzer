"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

interface Props {
  // "compact" zeigt nur den aktuellen Sprach-Code (DE/EN) — z.B. für den
  // Nav-Header. "full" zeigt eine Auswahlleiste mit allen Locales — z.B.
  // für den Footer.
  variant?: "compact" | "full";
  className?: string;
}

export function LanguageSwitcher({ variant = "compact", className = "" }: Props) {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      // next-intl's router behält den Pfad und tauscht nur das Locale-Prefix
      // aus; das Cookie wird automatisch mitgesetzt.
      router.replace(pathname, { locale: next });
    });
  }

  if (variant === "compact") {
    // Cycle-Through: bei zwei Sprachen reicht ein Toggle-Button. Klick
    // schaltet auf die jeweils andere Sprache.
    const other = routing.locales.find((l) => l !== locale) as Locale;
    return (
      <button
        type="button"
        onClick={() => switchTo(other)}
        disabled={pending}
        aria-label={t("label")}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs uppercase tracking-wider hover:bg-white/5 disabled:opacity-50 ${className}`}
        title={t("label")}
      >
        <Globe size={14} aria-hidden="true" />
        <span>{locale}</span>
      </button>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} role="group" aria-label={t("label")}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          disabled={pending || l === locale}
          aria-current={l === locale ? "true" : undefined}
          className={`px-2 py-1 rounded text-xs ${
            l === locale
              ? "bg-white/10 text-white"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          } disabled:cursor-default`}
        >
          {t(l as "de" | "en")}
        </button>
      ))}
    </div>
  );
}
