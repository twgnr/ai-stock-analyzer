"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Box, Square } from "lucide-react";

const STORAGE_KEY = "ai-stock-analyzer:3d:v1";

export type ThreeDMode = "off" | "on";

const OPTIONS: { id: ThreeDMode; icon: typeof Box }[] = [
  { id: "off", icon: Square },
  { id: "on", icon: Box },
];

function readMode(): ThreeDMode {
  if (typeof document === "undefined") return "off";
  return document.documentElement.getAttribute("data-3d") === "on" ? "on" : "off";
}

function subscribeMode(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const target = document.documentElement;
  const observer = new MutationObserver(cb);
  observer.observe(target, { attributes: true, attributeFilter: ["data-3d"] });
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) cb();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): ThreeDMode {
  return "off";
}

function applyMode(mode: ThreeDMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-3d", mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function ThreeDToggle() {
  const t = useTranslations("Shared.threeD");
  const mode = useSyncExternalStore(subscribeMode, readMode, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="inline-flex border border-[var(--border)] rounded-md overflow-hidden"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.id;
        const label = t(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyMode(opt.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              active
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
            }`}
            title={label}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
