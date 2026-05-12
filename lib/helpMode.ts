/**
 * Globaler Hilfe-Modus. Aktiviert sich per Toggle in der Nav (Fragezeichen).
 *
 * Aktiv: Auf <html data-help="on"> wird gesetzt. Der `HelpProvider` lauscht
 * dann auf Hover/Focus und zeigt die jeweilige Erklärung in der `HelpBar`
 * unter dem Liveticker.
 *
 * Persistiert in localStorage, Cross-Tab-synchron via `storage`-Event.
 */

export const HELP_MODE_STORAGE_KEY = "ai-stock-analyzer:help-mode:v1";
export const HELP_HOVER_EVENT = "sa:help-hover";

export type HelpMode = "on" | "off";

export function readHelpMode(): HelpMode {
  if (typeof document === "undefined") return "off";
  return document.documentElement.getAttribute("data-help") === "on" ? "on" : "off";
}

export function applyHelpMode(mode: HelpMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-help", mode);
  try {
    window.localStorage.setItem(HELP_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function subscribeHelpMode(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const target = document.documentElement;
  const observer = new MutationObserver(cb);
  observer.observe(target, { attributes: true, attributeFilter: ["data-help"] });
  function onStorage(e: StorageEvent) {
    if (e.key === HELP_MODE_STORAGE_KEY) cb();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

export interface HelpHoverDetail {
  helpKey: string | null;
}
