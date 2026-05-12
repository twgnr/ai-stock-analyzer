"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle } from "lucide-react";
import {
  applyHelpMode,
  readHelpMode,
  subscribeHelpMode,
  type HelpMode,
} from "@/lib/helpMode";

function getServerSnapshot(): HelpMode {
  return "off";
}

/**
 * Fragezeichen-Toggle in der Nav. Aktiv = Hilfe-Bar sichtbar, Hovern erklärt
 * Features. Inaktiv = unsichtbar, alles wie gewohnt.
 */
export function HelpToggle() {
  const t = useTranslations("Help");
  const mode = useSyncExternalStore(subscribeHelpMode, readHelpMode, getServerSnapshot);
  const isOn = mode === "on";

  return (
    <button
      type="button"
      onClick={() => applyHelpMode(isOn ? "off" : "on")}
      className={`relative p-2 rounded-md transition-colors ${
        isOn
          ? "text-[var(--accent)] bg-[var(--accent)]/10"
          : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
      }`}
      aria-label={isOn ? t("toggleAriaOn") : t("toggleAriaOff")}
      aria-pressed={isOn}
      title={isOn ? t("toggleTitleOn") : t("toggleTitleOff")}
      data-help="nav:help-toggle"
    >
      <HelpCircle size={18} aria-hidden="true" />
    </button>
  );
}
