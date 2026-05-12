"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Lädt FX-Raten für die angegebenen Währungen (default base = EUR)
 * und liefert einen Converter. Rate 0 heißt "unbekannt" — Caller
 * sollte dann auf Original-Währung zurückfallen.
 */
export function useFxRates(currencies: string[]) {
  const key = useMemo(
    () =>
      [...new Set(currencies.map((c) => c.toUpperCase()))]
        .filter(Boolean)
        .sort()
        .join(","),
    [currencies]
  );
  const [rates, setRates] = useState<Record<string, number>>({});
  const [base, setBase] = useState("EUR");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!key) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/fx?currencies=${encodeURIComponent(key)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          base: string;
          rates: Record<string, number>;
        };
        if (cancelled) return;
        setRates(data.rates || {});
        setBase(data.base || "EUR");
      } catch {
        // ignore — Caller wird rateFor()=0 sehen und kann fallback zeigen
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  function rateFor(currency: string): number {
    const c = (currency || "").toUpperCase();
    if (!c) return 0;
    if (c === base.toUpperCase()) return 1;
    return rates[c] ?? 0;
  }

  /**
   * Rechnet `amount` in der Originalwährung in die Base-Währung um.
   * Liefert null, wenn keine Rate bekannt ist — dann sollte der Caller
   * den Original-Betrag anzeigen.
   */
  function toBase(amount: number, currency: string): number | null {
    const r = rateFor(currency);
    if (r <= 0) return null;
    return amount * r;
  }

  return { rates, base, loaded, rateFor, toBase };
}
