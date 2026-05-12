"use client";

import { useEffect } from "react";

/**
 * Aktiviert globalen 3D-Tilt-Effekt auf `.card`-Elementen, solange auf
 * `<html>` das Attribut `data-3d="on"` gesetzt ist (gesteuert vom
 * `<ThreeDToggle>` in den Einstellungen).
 *
 * Implementierung: ein einziger `mousemove`-Listener auf document, der die
 * gehoverte Card per `closest(".card")` findet und CSS-Variablen
 * `--3d-tilt-x` / `--3d-tilt-y` setzt. Das Restliche macht CSS (siehe
 * `[data-3d="on"] .card` in globals.css).
 *
 * Reset, sobald die Maus eine andere Card oder gar keine Card mehr
 * berührt. Touch-Geräte haben kein hover → der Effekt bleibt dort
 * komplett aus, ohne aktive Inhibition.
 */
const MAX_TILT_DEG = 6;

export function ThreeDProvider() {
  useEffect(() => {
    let activeCard: HTMLElement | null = null;

    function isEnabled(): boolean {
      return document.documentElement.getAttribute("data-3d") === "on";
    }

    function reset(card: HTMLElement | null) {
      if (!card) return;
      card.style.removeProperty("--3d-tilt-x");
      card.style.removeProperty("--3d-tilt-y");
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isEnabled()) return;
      const target = (e.target as HTMLElement | null)?.closest(
        ".card"
      ) as HTMLElement | null;
      if (target !== activeCard) {
        reset(activeCard);
        activeCard = target;
      }
      if (!activeCard) return;
      const rect = activeCard.getBoundingClientRect();
      // Position der Maus relativ zur Card-Mitte (-0.5 bis +0.5).
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      // Vorzeichen so, dass man „nach hinten/oben" kippt, wenn die Maus
      // auf der oberen/rechten Hälfte ist — fühlt sich physisch korrekt an.
      activeCard.style.setProperty("--3d-tilt-x", `${(-y * MAX_TILT_DEG).toFixed(2)}deg`);
      activeCard.style.setProperty("--3d-tilt-y", `${(x * MAX_TILT_DEG).toFixed(2)}deg`);
    }

    function handlePointerLeave() {
      reset(activeCard);
      activeCard = null;
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        reset(activeCard);
        activeCard = null;
      }
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      reset(activeCard);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
