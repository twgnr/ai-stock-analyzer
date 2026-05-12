import { defineRouting } from "next-intl/routing";

// Unterstützte Sprachen + Default. Reihenfolge im Array bestimmt das
// next-intl-Locale-Matching, falls keine User-Präferenz vorliegt — die erste
// Sprache, die der Browser akzeptiert, gewinnt.
export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  // 'as-needed': Default-Sprache läuft ohne Prefix (/portfolio statt
  // /de/portfolio), nur Nicht-Default bekommt eines (/en/portfolio).
  // Vorteil: bestehende Bookmarks und SEO-Links funktionieren weiter, kein
  // 301-Sprung bei deutschen Nutzern.
  localePrefix: "as-needed",
  // Cookie persistiert die Sprachwahl 1 Jahr.
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type Locale = (typeof routing.locales)[number];
