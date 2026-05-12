import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type AlertTone = "error" | "success" | "warning" | "info";

interface Props {
  tone: AlertTone;
  children: ReactNode;
  /** Überschreibbare ARIA-Rolle — default passt zum Tone. */
  role?: "alert" | "status";
  className?: string;
}

/**
 * WCAG 4.1.3 Status Messages: kurzlebige Meldungen müssen Screenreadern
 * ohne Fokuswechsel gemeldet werden. `role="alert"` hat eine implizite
 * `aria-live="assertive"`, `role="status"` hat `aria-live="polite"`.
 * Wir verwenden assertive für Fehler/Warnungen, polite für Erfolge/Infos.
 */
export function Alert({ tone, children, role, className = "" }: Props) {
  const defaultRole: "alert" | "status" =
    tone === "error" || tone === "warning" ? "alert" : "status";
  const toneClass =
    tone === "error"
      ? "text-[var(--red)] bg-red-500/10 border-red-500/30"
      : tone === "success"
        ? "text-[var(--green)] bg-green-500/10 border-green-500/30"
        : tone === "warning"
          ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
          : "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--border-strong)]";
  const Icon =
    tone === "error"
      ? AlertCircle
      : tone === "success"
        ? CheckCircle2
        : tone === "warning"
          ? TriangleAlert
          : Info;

  return (
    <div
      role={role ?? defaultRole}
      className={`card p-3 border flex items-start gap-2 text-sm ${toneClass} ${className}`}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
