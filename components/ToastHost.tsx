"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { TOAST_EVENT, type ToastDetail, type ToastTone } from "@/lib/toast";

interface ToastItem extends ToastDetail {
  id: string;
}

const DEFAULT_DURATION = 3500;

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail || !detail.msg) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = detail.durationMs ?? DEFAULT_DURATION;
      setItems((prev) => [...prev.slice(-3), { ...detail, id }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  function dismiss(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const t = useTranslations("Toast");
  const toneClass = toneClasses(item.tone);
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={`pointer-events-auto card border flex items-start gap-2 px-3 py-2.5 text-sm shadow-lg ${toneClass}`}
    >
      {item.tone === "success" && (
        <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      )}
      {item.tone === "error" && (
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      )}
      {item.tone === "info" && (
        <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0 break-words">{item.msg}</div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 -mr-1 -mt-0.5 p-1 text-[var(--muted)] hover:text-white"
        aria-label={t("closeAria")}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function toneClasses(tone: ToastTone): string {
  if (tone === "success")
    return "text-[var(--green)] bg-green-500/10 border-green-500/30";
  if (tone === "error")
    return "text-[var(--red)] bg-red-500/10 border-red-500/30";
  return "text-[var(--foreground)] bg-[var(--surface-2)] border-[var(--border-strong)]";
}
