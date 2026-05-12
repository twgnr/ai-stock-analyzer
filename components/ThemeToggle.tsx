"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";

const STORAGE_KEY = "ai-stock-analyzer:theme:v1";

export type Theme = "dark" | "light" | "auto";

const OPTIONS: { id: Theme; icon: typeof Sun }[] = [
  { id: "dark", icon: Moon },
  { id: "light", icon: Sun },
  { id: "auto", icon: Monitor },
];

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const v = document.documentElement.getAttribute("data-theme");
  if (v === "light" || v === "auto") return v;
  return "dark";
}

function subscribeTheme(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const target = document.documentElement;
  const observer = new MutationObserver(cb);
  observer.observe(target, { attributes: true, attributeFilter: ["data-theme"] });
  // Cross-Tab-Sync: andere Tabs setzen das Theme via storage event.
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) cb();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {}
}

export function ThemeToggle() {
  const t = useTranslations("Shared.theme");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="inline-flex border border-[var(--border)] rounded-md overflow-hidden"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.id;
        const label = t(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(opt.id)}
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
