"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslations("Shared.confirm");
  const resolvedConfirm = confirmLabel ?? t("confirm");
  const resolvedCancel = cancelLabel ?? t("cancel");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    // Cancel-Button als sichereren Default fokussieren.
    requestAnimationFrame(() => cancelRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="card p-5 w-full max-w-md mt-12 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {tone === "danger" && (
              <AlertTriangle
                size={20}
                className="flex-shrink-0 mt-0.5 text-[var(--red)]"
                aria-hidden="true"
              />
            )}
            <h2 id="confirm-dialog-title" className="font-semibold text-lg">
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 -mt-1 -mr-1 text-[var(--muted)] hover:text-white"
            aria-label={t("closeAria")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="text-sm text-[var(--muted)]">{message}</div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="btn"
          >
            {resolvedCancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
          >
            {busy && <span className="spinner" />}
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
