"use client";

import { useEffect, useRef } from "react";
import { HELP_HOVER_EVENT, type HelpHoverDetail } from "@/lib/helpMode";

/**
 * Globaler Hover/Focus-Listener. Findet bei jedem `mouseover`/`focusin` das
 * nächstgelegene Element mit `data-help="..."` und feuert ein
 * CustomEvent (`HELP_HOVER_EVENT`) mit dem Schlüssel — die `HelpBar` lauscht
 * darauf und zeigt den entsprechenden Text.
 *
 * Aktiv nur wenn `<html data-help="on">`. Außerhalb davon kein Overhead
 * (early-return im Handler).
 */
export function HelpProvider() {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function isEnabled(): boolean {
      return document.documentElement.getAttribute("data-help") === "on";
    }

    function emit(key: string | null) {
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      const detail: HelpHoverDetail = { helpKey: key };
      window.dispatchEvent(new CustomEvent<HelpHoverDetail>(HELP_HOVER_EVENT, { detail }));
    }

    function findHelpKey(target: EventTarget | null): string | null {
      const el = (target as HTMLElement | null)?.closest?.("[data-help]") as
        | HTMLElement
        | null;
      return el?.getAttribute("data-help") || null;
    }

    function onMouseOver(e: MouseEvent) {
      if (!isEnabled()) return;
      emit(findHelpKey(e.target));
    }

    function onFocusIn(e: FocusEvent) {
      if (!isEnabled()) return;
      emit(findHelpKey(e.target));
    }

    function onMouseLeaveDocument() {
      if (!isEnabled()) return;
      emit(null);
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mouseleave", onMouseLeaveDocument);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("mouseleave", onMouseLeaveDocument);
    };
  }, []);

  return null;
}
