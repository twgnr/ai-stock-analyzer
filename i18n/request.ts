import fs from "node:fs/promises";
import path from "node:path";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Wird vom next-intl-Plugin per createNextIntlPlugin() automatisch geladen,
// liefert pro Request die Message-Catalogs und das aktuelle Locale.
//
// Aufbau: pro Locale ein Ordner `messages/{locale}/`, darin pro Namespace
// eine eigene `{Namespace}.json`. Vorteil gegenüber einer einzigen großen
// JSON-Datei: parallele Bearbeitung mehrerer Namespaces ohne Merge-
// Konflikte. Beim Build/Request werden alle Namespace-Dateien geladen und
// zu einem Objekt vereint, das der Provider verwendet.
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const dir = path.join(process.cwd(), "messages", locale);
  const entries = await fs.readdir(dir);
  const out: Record<string, unknown> = {};
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const ns = file.slice(0, -5);
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    out[ns] = JSON.parse(raw);
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
