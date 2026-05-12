"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import {
  ACCENT_STORAGE_KEY,
  applyAccent,
  isValidAccent,
  readStoredAccent,
  writeStoredAccent,
} from "@/lib/accentColor";

/** Komfort-Vorschläge — der User kann trotzdem mit dem Color-Picker frei wählen. */
const PRESETS: Array<{ value: string; key: "blue" | "sky" | "green" | "teal" | "violet" | "pink" | "orange" | "yellow" | "red" }> = [
  { value: "#3b82f6", key: "blue" },
  { value: "#0ea5e9", key: "sky" },
  { value: "#10b981", key: "green" },
  { value: "#14b8a6", key: "teal" },
  { value: "#8b5cf6", key: "violet" },
  { value: "#ec4899", key: "pink" },
  { value: "#f97316", key: "orange" },
  { value: "#eab308", key: "yellow" },
  { value: "#dc2626", key: "red" },
];

export function AccentColorPicker() {
  const t = useTranslations("Shared.accent");
  const tPresets = useTranslations("Shared.accent.presets");
  // null = kein Override → Standard aus globals.css greift.
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setColor(readStoredAccent());
    // Cross-Tab-Sync: in einem anderen Tab geänderte Farbe übernehmen.
    function onStorage(e: StorageEvent) {
      if (e.key !== ACCENT_STORAGE_KEY) return;
      const next = isValidAccent(e.newValue) ? e.newValue : null;
      setColor(next);
      applyAccent(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function setAccent(next: string) {
    if (!isValidAccent(next)) return;
    setColor(next);
    applyAccent(next);
    writeStoredAccent(next);
  }

  function reset() {
    setColor(null);
    applyAccent(null);
    writeStoredAccent(null);
  }

  // Beim Picker brauchen wir immer einen gültigen Hex-Wert; im Reset-Zustand
  // (color === null) zeigen wir den dunklen Default als sichtbare Vorschau.
  const pickerValue = color ?? "#3b82f6";
  const overridden = color !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => setAccent(e.target.value)}
            className="h-8 w-12 rounded border border-[var(--border)] bg-transparent cursor-pointer"
            aria-label={t("pickAria")}
          />
          <span className="text-xs num text-[var(--muted)] uppercase">{pickerValue}</span>
        </label>
        <button
          onClick={reset}
          disabled={!overridden}
          className="btn text-xs"
          title={t("resetTitle")}
          type="button"
        >
          <RotateCcw size={12} aria-hidden="true" />
          {t("reset")}
        </button>
        {overridden ? (
          <span className="text-[10px] text-[var(--muted)]">{t("customActive")}</span>
        ) : (
          <span className="text-[10px] text-[var(--muted)]">{t("defaultActive")}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("presetsLabel")}>
        {PRESETS.map((p) => {
          const active = (color ?? "").toLowerCase() === p.value.toLowerCase();
          const label = tPresets(p.key);
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setAccent(p.value)}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                active
                  ? "border-[var(--foreground)] ring-2 ring-[var(--foreground)]/30"
                  : "border-[var(--border)]"
              }`}
              style={{ backgroundColor: p.value }}
              title={label}
              aria-label={label}
              aria-pressed={active}
            />
          );
        })}
      </div>
    </div>
  );
}
