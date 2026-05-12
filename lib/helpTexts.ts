/**
 * Hilfe-Texte für den globalen Hilfe-Modus.
 *
 * Format: `data-help="schluessel"` auf einem DOM-Element setzt den Hilfe-Text,
 * der vom HelpProvider beim Hover/Focus gefunden und in der HelpBar oben
 * angezeigt wird.
 *
 * Schlüssel-Konvention: `<bereich>:<id>` mit Bereichen
 *   - `nav:`        Hauptnavigation
 *   - `btn:`        wiederkehrende Action-Buttons
 *   - `col:<page>:` Tabellenspalten pro Seite
 *   - `tab:`        Tab-Bezeichnungen (z. B. Settings)
 *   - `indicator:`  Chart-Indikatoren
 *   - `badge:`      Badges, Empfehlungen
 *   - `feature:`    größere Sektionen / Funktionen
 *
 * Die eigentlichen Texte stehen in `messages/{de,en}/HelpTexts.json` und
 * werden über `useTranslations("HelpTexts")` aufgelöst. Dieses Modul bleibt
 * nur als Fallback-Builder für dynamische `indicator:*`-Schlüssel, deren
 * Label/Beschreibung aus dem `INDICATORS`-Katalog stammen.
 */
import { INDICATORS } from "./chartIndicators";

export type HelpEntry = {
  title: string;
  description: string;
};

export const HELP_DEFAULT_KEY = "default";

/**
 * Dynamischer Fallback für `indicator:<KEY>`-Schlüssel, die nicht explizit in
 * der HelpTexts-Catalog stehen — baut Title/Description aus dem
 * `INDICATORS`-Katalog. Bekommt das `t`-Pendant für die i18n-Strings
 * (Kategorie-Label, Overlay-Hinweise) injiziert. Der `INDICATORS`-Katalog
 * selbst ist aktuell noch auf Deutsch — Migration als Follow-up.
 */
export function indicatorFallback(
  key: string,
  t: (k: "category" | "overlayYes" | "overlayNo") => string
): HelpEntry | null {
  if (!key.startsWith("indicator:")) return null;
  const indKey = key.slice("indicator:".length);
  const ind = INDICATORS.find(
    (i) => i.key === indKey || i.key.toLowerCase() === indKey.toLowerCase()
  );
  if (!ind) return null;
  return {
    title: `${ind.abbrev} — ${ind.label}`,
    description: `${ind.description}. ${t("category")}: ${ind.category}.${
      ind.overlay ? " " + t("overlayYes") : " " + t("overlayNo")
    }`,
  };
}
