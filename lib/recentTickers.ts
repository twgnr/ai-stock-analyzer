/**
 * Lokale „Zuletzt angesehen"-Liste der Ticker. Reines localStorage —
 * Hot-Path-Persistierung ohne Backend-Schreibe pro Klick.
 */

const STORAGE_KEY = "ai-stock-analyzer:recent-tickers:v1";
const MAX_RECENT = 12;
const EVENT = "sa:recent-tickers";

export interface RecentTicker {
  ticker: string;
  /** Optional vom Caller gesetzt — falls vorhanden, in Vorschlägen anzeigbar. */
  name?: string;
  /** Unix-ms des letzten Aufrufs. Bei Re-Visit aktualisiert. */
  at: number;
}

function safeParse(raw: string | null): RecentTicker[] {
  if (!raw) return EMPTY_LIST;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_LIST;
    const out: RecentTicker[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as RecentTicker).ticker === "string" &&
        typeof (item as RecentTicker).at === "number"
      ) {
        out.push({
          ticker: (item as RecentTicker).ticker.toUpperCase(),
          name: (item as RecentTicker).name,
          at: (item as RecentTicker).at,
        });
      }
    }
    return out;
  } catch {
    return EMPTY_LIST;
  }
}

/**
 * Stable shared empty-list reference und Cache. `useSyncExternalStore`
 * verlangt, dass getSnapshot referentiell stabil bleibt, solange sich der
 * Quelltext nicht geändert hat — sonst feuert es bei jedem Render einen
 * Re-Render und endet in einer „Maximum update depth"-Schleife.
 */
const EMPTY_LIST: RecentTicker[] = Object.freeze([]) as unknown as RecentTicker[];
let cachedRaw: string | null = null;
let cachedList: RecentTicker[] = EMPTY_LIST;

export function getRecentTickers(): RecentTicker[] {
  if (typeof window === "undefined") return EMPTY_LIST;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = safeParse(raw);
  return cachedList;
}

export function addRecentTicker(ticker: string, name?: string) {
  if (typeof window === "undefined") return;
  const upper = ticker.trim().toUpperCase();
  if (!upper) return;
  const list = getRecentTickers().filter((r) => r.ticker !== upper);
  list.unshift({ ticker: upper, name, at: Date.now() });
  const trimmed = list.slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* localStorage voll oder disabled — egal */
  }
}

export function clearRecentTickers() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

/** Subscribe für die Component-Hooks (CommandPalette, Dashboard-Widget …). */
export function subscribeRecentTickers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
