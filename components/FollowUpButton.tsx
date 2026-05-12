"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X, AlertCircle } from "lucide-react";

interface Props {
  /** Was soll vertieft werden? Z.B. ein Bullet-Text. */
  topic: string;
  /** Komplette Original-Analyse als Kontext (summary + reasoning + risks/opps). */
  originalSummary: string;
  /** Optionaler Ticker. */
  ticker?: string;
  /** Visueller Hinweis-Text auf dem Button. Default „Vertiefen". */
  label?: string;
  className?: string;
}

/**
 * Inline-Vertiefen-Button: bei Klick öffnet sich darunter ein kleines Antwort-
 * Panel, das die Folge-Analyse zeigt. Kein Modal — bleibt im Lesefluss.
 */
export function FollowUpButton({
  topic,
  originalSummary,
  ticker,
  label,
  className = "",
}: Props) {
  const t = useTranslations("AnalysisPanels.followUp");
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonLabel = label ?? t("label");

  async function run() {
    setOpen(true);
    if (reply || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, originalSummary, ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReply(data.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      {!open && (
        <button
          type="button"
          onClick={run}
          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        >
          <Sparkles size={11} aria-hidden="true" />
          {buttonLabel}
        </button>
      )}
      {open && (
        <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
              <Sparkles size={10} />
              {t("header")}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--muted)] hover:text-white -mt-0.5 -mr-0.5 p-0.5"
              aria-label={t("close")}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-[var(--muted)] text-xs">
              <span className="spinner" /> {t("generating")}
            </div>
          )}
          {error && (
            <div className="text-[var(--red)] text-xs flex items-start gap-1.5">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {reply && (
            <p className="leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
              {reply}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
