const PREFIX = "ai-stock-analyzer:";
const VERSION = "v1";

export function saveState<T extends object>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ ...data, _ts: Date.now() });
    localStorage.setItem(`${PREFIX}${key}:${VERSION}`, payload);
  } catch {}
}

export function loadState<T>(key: string): (T & { _ts: number }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}:${VERSION}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearState(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${PREFIX}${key}:${VERSION}`);
  } catch {}
}

/**
 * Strukturierte Beschreibung eines „Alter eines Zeitstempels". Wird per t()
 * im Renderer in die jeweilige Sprache übersetzt (siehe messages/Format.json,
 * Namespace `Format.age`). Beispiel-Verwendung:
 *
 *     const t = useTranslations("Format.age");
 *     const desc = formatAge(timestamp);
 *     return t(desc.key, desc.values);
 */
export type AgeDescriptor =
  | { key: "justNow"; values?: undefined }
  | { key: "minutesAgo"; values: { value: number } }
  | { key: "hoursAgo"; values: { value: number } }
  | { key: "daysAgo"; values: { value: number } };

export function formatAge(timestamp: number): AgeDescriptor {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return { key: "justNow" };
  const min = Math.floor(sec / 60);
  if (min < 60) return { key: "minutesAgo", values: { value: min } };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { key: "hoursAgo", values: { value: hr } };
  const days = Math.floor(hr / 24);
  return { key: "daysAgo", values: { value: days } };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Liefert eine Tailwind-Klasse für die farbliche Hervorhebung von
 * Aktualisierungs-Zeitstempeln: hellrot wenn die Daten älter als 1 Tag sind,
 * sonst leerer String (kein Override).
 *
 * Akzeptiert Number (ms-Timestamp), Date oder String (ISO).
 */
export function ageHighlightClass(
  timestamp: number | Date | string | null | undefined
): string {
  if (timestamp == null) return "";
  const ts =
    typeof timestamp === "number"
      ? timestamp
      : timestamp instanceof Date
        ? timestamp.getTime()
        : new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return "";
  const ageMs = Date.now() - ts;
  return ageMs > ONE_DAY_MS ? "text-red-400" : "";
}
