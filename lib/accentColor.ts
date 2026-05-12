/**
 * User-konfigurierbare Akzentfarbe — überschreibt die theme-spezifische
 * `--accent`-CSS-Variable per Inline-Style auf `<html>`. Der Inline-Style
 * gewinnt gegenüber den `[data-theme="..."]`-Regeln in globals.css, sodass
 * die Wahl in Hell- und Dunkel-Modus identisch greift.
 *
 * Reset („Auf Standard"): Inline-Style entfernen, dann übernehmen wieder
 * die theme-spezifischen Werte aus globals.css.
 */

export const ACCENT_STORAGE_KEY = "ai-stock-analyzer:accent:v1";

/** Akzeptiertes Hex-Format: #rgb oder #rrggbb. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidAccent(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

export function applyAccent(color: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (color && isValidAccent(color)) {
    root.style.setProperty("--accent", color);
  } else {
    root.style.removeProperty("--accent");
  }
}

export function readStoredAccent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isValidAccent(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredAccent(color: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (color && isValidAccent(color)) {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, color);
    } else {
      window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    }
  } catch {
    // localStorage kann in Privatmodi geblockt sein — dann läuft der Override
    // halt nur für die aktuelle Session, das ist okay.
  }
}
