"use client";

import { useEffect, useRef } from "react";

/**
 * Unsichtbarer Client-Trigger für den Movers-Autoscan.
 *
 * Jeder eingeloggte Browser-Tab pingt den Server alle 5 Minuten.
 * Der Server entscheidet anhand der Admin-Config + Scan-Lock + Staleness,
 * ob tatsächlich gescannt wird. Laufen mehrere Tabs/User gleichzeitig,
 * dedupliziert der bestehende Scan-Lock von rebuildMoversSnapshot.
 *
 * Beim ersten Render wird 15 Sekunden gewartet, damit initial die UI ruhig
 * hochlaufen kann (kein Scan-Wirbel beim Login-Rush).
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;

export function MoversAutoScan() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    async function ping() {
      if (cancelled) return;
      if (document.hidden) return; // Nur wenn Tab aktiv
      try {
        await fetch("/api/movers/autoscan", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // Silent — nächster Tick versucht's erneut
      }
    }

    const initTimer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      ping();
    }, INITIAL_DELAY_MS);

    const interval = setInterval(ping, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, []);

  return null;
}
