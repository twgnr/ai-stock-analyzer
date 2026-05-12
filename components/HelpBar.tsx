"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, X } from "lucide-react";
import {
  applyHelpMode,
  HELP_HOVER_EVENT,
  readHelpMode,
  subscribeHelpMode,
  type HelpHoverDetail,
} from "@/lib/helpMode";
import { HELP_DEFAULT_KEY, indicatorFallback, type HelpEntry } from "@/lib/helpTexts";

function getServerSnapshot(): "on" | "off" {
  return "off";
}

/**
 * Sticky Info-Leiste, die ganz oben (unter dem Liveticker) erscheint, wenn
 * der Hilfe-Modus aktiv ist. Default-Text bei keinem Hover; sobald ein
 * Element mit `data-help="..."` gehovert/fokussiert wird, zeigt sie den
 * Titel + Beschreibung dieses Schlüssels an.
 *
 * Auflösungs-Reihenfolge:
 *   1. Eintrag direkt aus `messages/{de,en}/HelpTexts.json` (via `t.has`).
 *   2. Wenn `indicator:*`-Schlüssel: Fallback aus dem INDICATORS-Katalog.
 *   3. Default-Eintrag.
 */
export function HelpBar() {
  const t = useTranslations("Help");
  const tHelp = useTranslations("HelpTexts");
  const mode = useSyncExternalStore(subscribeHelpMode, readHelpMode, getServerSnapshot);
  const [helpKey, setHelpKey] = useState<string | null>(null);

  useEffect(() => {
    function onHover(e: Event) {
      const ce = e as CustomEvent<HelpHoverDetail>;
      setHelpKey(ce.detail?.helpKey ?? null);
    }
    window.addEventListener(HELP_HOVER_EVENT, onHover);
    return () => window.removeEventListener(HELP_HOVER_EVENT, onHover);
  }, []);

  if (mode !== "on") return null;

  const entry = resolveEntry();

  function resolveEntry(): HelpEntry {
    // 1) Direkter Catalog-Hit.
    if (helpKey && tHelp.has(`${helpKey}.title` as Parameters<typeof tHelp>[0])) {
      return {
        title: tHelp(`${helpKey}.title` as Parameters<typeof tHelp>[0]),
        description: tHelp(`${helpKey}.description` as Parameters<typeof tHelp>[0]),
      };
    }
    // 2) Indicator-Fallback aus dem INDICATORS-Katalog.
    if (helpKey) {
      const fallback = indicatorFallback(helpKey, (k) =>
        tHelp(`indicatorFallback.${k}` as Parameters<typeof tHelp>[0])
      );
      if (fallback) return fallback;
    }
    // 3) Default.
    return {
      title: tHelp(`${HELP_DEFAULT_KEY}.title` as Parameters<typeof tHelp>[0]),
      description: tHelp(`${HELP_DEFAULT_KEY}.description` as Parameters<typeof tHelp>[0]),
    };
  }

  // Doppel-Render-Pattern:
  //  1. Ein `aria-hidden`-Spacer hält den Platz im normalen Layout-Flow frei,
  //     sodass der Content darunter nicht von der fixed-Bar verdeckt wird.
  //  2. Die eigentliche Bar ist `position: fixed`, klebt also unabhängig vom
  //     Scroll-Container immer direkt unter der Nav (top: 3.5rem = Nav-Höhe).
  // Sticky in einem flex-col-body verhält sich nicht zuverlässig bei langen
  // Pages — fixed ist hier robuster.
  return (
    <>
      <div aria-hidden="true" className="h-[3.5rem]" />
      <div
        role="status"
        aria-live="polite"
        className="fixed top-[3.5rem] left-0 right-0 z-30 h-[3.5rem] border-b border-[var(--accent)]/40 bg-[var(--accent)]/10 backdrop-blur text-sm shadow-sm overflow-hidden"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-start gap-3">
          <HelpCircle
            size={16}
            className="text-[var(--accent)] flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-[var(--foreground)]">{entry.title}</div>
            <div className="text-xs text-[var(--muted)] leading-relaxed">{entry.description}</div>
          </div>
          <button
            onClick={() => applyHelpMode("off")}
            className="text-[var(--muted)] hover:text-[var(--foreground)] flex-shrink-0 -mt-0.5"
            aria-label={t("barCloseAria")}
            title={t("barCloseTitle")}
            data-help="nav:help-toggle"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
