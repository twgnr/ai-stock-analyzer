/**
 * Handelszeiten-Check pro Börse.
 *
 * Vereinfachte Implementation — ignoriert Feiertage und Half-Days. Für den
 * Auto-Scan reicht das: wenn an einem Feiertag trotzdem gescannt wird,
 * bekommen wir einfach die Vortages-Schlusskurse.
 *
 * Quellen:
 *  - XETRA (DE): Mo-Fr 09:00-17:30 Europe/Berlin
 *  - NYSE/Nasdaq (US): Mo-Fr 09:30-16:00 America/New_York
 */

export type Exchange = "XETRA" | "NYSE";

function partsForZone(now: Date, timeZone: string): {
  weekday: number; // 0 = Sun ... 6 = Sat
  hour: number;
  minute: number;
} {
  // Intl.DateTimeFormat kann eine Zone korrekt abbilden, ohne tzdb-Dependency.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { weekday: weekdays[wdStr] ?? 1, hour: hour === 24 ? 0 : hour, minute };
}

function withinWindow(
  now: Date,
  timeZone: string,
  startH: number,
  startM: number,
  endH: number,
  endM: number
): boolean {
  const { weekday, hour, minute } = partsForZone(now, timeZone);
  if (weekday === 0 || weekday === 6) return false;
  const cur = hour * 60 + minute;
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  return cur >= start && cur <= end;
}

export function isExchangeOpen(exchange: Exchange, now: Date = new Date()): boolean {
  if (exchange === "XETRA") {
    return withinWindow(now, "Europe/Berlin", 9, 0, 17, 30);
  }
  if (exchange === "NYSE") {
    return withinWindow(now, "America/New_York", 9, 30, 16, 0);
  }
  return false;
}

/**
 * True, wenn mindestens eine der relevanten Börsen gerade offen ist.
 * Praktisch: Mo-Fr zwischen 09:00 und 22:00 MEZ/MESZ ist das immer der Fall
 * (XETRA bis 17:30, NYSE ab 15:30). Außerhalb → keine Refreshes nötig, weil
 * sich die Kurse ohnehin nicht ändern.
 */
export function isAnyMarketOpen(now: Date = new Date()): boolean {
  return isExchangeOpen("XETRA", now) || isExchangeOpen("NYSE", now);
}

/**
 * Erweitertes Handelsfenster: Mo–Fr 09:00–23:00 Europe/Berlin.
 * Deckt XETRA (Eröffnung) bis NYSE-Schluss + ein bisschen After-Hours ab.
 * Dient dem Auto-Update als Zeit-Gate: außerhalb dieser Stunden bewegen sich
 * weder europäische noch US-Indizes, ein Refresh wäre Verschwendung.
 */
export function isWithinExtendedTradingWindow(now: Date = new Date()): boolean {
  return withinWindow(now, "Europe/Berlin", 9, 0, 23, 0);
}

export function exchangeForIndex(
  indexKey: string
): Exchange | null {
  const k = indexKey.toLowerCase();
  if (["dax", "mdax", "sdax", "tecdax", "xetra"].includes(k)) return "XETRA";
  if (["dow", "sp500", "nasdaq100"].includes(k)) return "NYSE";
  return null;
}

/**
 * Sollte dieser Index jetzt überhaupt gescannt werden? Portfolio/Watchlist
 * kennen wir nicht im Vorfeld — die werden extern immer live gepullt und
 * fallen hier nicht rein.
 */
export function shouldScanIndex(
  indexKey: string,
  now: Date = new Date()
): { ok: boolean; reason?: string } {
  const ex = exchangeForIndex(indexKey);
  if (!ex) return { ok: false, reason: "Unbekannte Börse für Index" };
  if (!isExchangeOpen(ex, now)) {
    return { ok: false, reason: `${ex} außerhalb Handelszeit` };
  }
  return { ok: true };
}
