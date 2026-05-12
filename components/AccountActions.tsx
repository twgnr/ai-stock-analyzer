"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

export function AccountActions() {
  const t = useTranslations("Settings.account");
  const tCommon = useTranslations("Settings.common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (!password) {
      setError(t("passwordRequired"));
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(t("deleted"));
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-[var(--muted)]">{t("body")}</p>

      {error && (
        <div className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-[var(--green)] flex items-center gap-2">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 pt-3 border-t border-[var(--border)] flex-wrap">
        <div className="text-sm max-w-md">
          <div className="font-medium">{t("exportTitle")}</div>
          <div className="text-[var(--muted)] text-xs mt-1">{t("exportBody")}</div>
        </div>
        <a href="/api/user/export" className="btn" download>
          <Download size={14} />
          {t("exportDownload")}
        </a>
      </div>

      <div className="flex items-start justify-between gap-4 pt-3 border-t border-[var(--border)] flex-wrap">
        <div className="text-sm max-w-md">
          <div className="font-medium text-[var(--red)]">{t("deleteTitle")}</div>
          <div className="text-[var(--muted)] text-xs mt-1">{t("deleteBody")}</div>
        </div>
        {!confirmOpen ? (
          <button
            onClick={() => {
              setConfirmOpen(true);
              setError(null);
            }}
            className="btn btn-danger"
          >
            <Trash2 size={14} />
            {t("deleteAction")}
          </button>
        ) : (
          <div className="w-full space-y-2">
            <div className="text-sm text-[var(--red)] flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span
                dangerouslySetInnerHTML={{ __html: t.raw("deleteWarning") as string }}
              />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("deletePasswordPlaceholder")}
              className="input"
              autoComplete="current-password"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setPassword("");
                  setError(null);
                }}
                className="btn"
                disabled={deleting}
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !password}
                className="btn btn-danger"
              >
                {deleting ? <div className="spinner" /> : <Trash2 size={14} />}
                {deleting ? t("deleting") : t("deleteFinal")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
