"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Link } from "@/i18n/navigation";

const STORAGE_KEY = "cookie-notice-acknowledged-v1";

// Dieser Banner informiert nur — er fragt keine Einwilligung ab, weil die App
// ausschließlich technisch notwendige Cookies (Session-Token) setzt, die nach
// § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei sind. Wenn später Analytics
// oder ähnliches hinzukommt, muss der Banner zu einem Consent-Dialog
// erweitert werden.

export function CookieBanner() {
  const t = useTranslations("Cookie");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const ack = localStorage.getItem(STORAGE_KEY);
      if (!ack) setVisible(true);
    } catch {
      // Wenn localStorage blockiert ist, zeigen wir den Banner nicht persistent —
      // das ist OK, weil wir ohnehin keine Einwilligung abfragen.
    }
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t("title")}
      className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-40 card p-4 shadow-lg space-y-3"
    >
      <div className="flex items-start gap-2">
        <Cookie size={18} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold mb-1">{t("title")}</div>
          <p className="text-[var(--muted)] text-xs leading-relaxed">
            {t("message")}{" "}
            <Link href="/datenschutz" className="underline">
              {t("more")}
            </Link>
            .
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={acknowledge} className="btn btn-primary text-xs">
          {t("accept")}
        </button>
      </div>
    </div>
  );
}
