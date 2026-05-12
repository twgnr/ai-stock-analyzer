import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

// Liest die Locale-Präferenz aus dem Cookie (Switcher-Wahl) oder
// fällt auf den Accept-Language-Header zurück. Wird in API-Routes
// genutzt, um Fehlertexte in der Sprache des Aufrufers zu liefern.
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale;
  }
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language") || "";
  const first = acceptLanguage.split(",")[0]?.split("-")[0]?.toLowerCase();
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return first as Locale;
  }
  return routing.defaultLocale as Locale;
}

// Convenience-Wrapper für API-Routen — kapselt Locale-Detection und
// Namespace-Lookup.
export async function getApiTranslations(namespace = "Api") {
  const locale = await getRequestLocale();
  return getTranslations({ locale, namespace });
}

// Normalisiert einen optionalen Wert aus dem User-Dokument auf eine gültige
// Locale. Fallback auf den App-Default (`de`), wenn der Wert fehlt oder nicht
// in `routing.locales` enthalten ist.
export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && (routing.locales as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return routing.defaultLocale as Locale;
}

// Liefert ein `t()` für E-Mail-Texte. Locale kommt **nicht** aus Cookie oder
// Accept-Language-Header, sondern aus dem User-Dokument (`user.locale`) —
// E-Mail-Versand läuft oft im Cron-Kontext, wo kein Request existiert. Für
// User ohne explizite Präferenz fällt `normalizeLocale` auf `de` zurück.
export async function getEmailTranslations(
  locale: Locale | string | null | undefined,
  namespace = "Email"
) {
  return getTranslations({ locale: normalizeLocale(locale), namespace });
}
