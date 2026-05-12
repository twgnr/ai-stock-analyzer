"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import {
  getPwaInstallState,
  onPwaStateChange,
  registerPwa,
  triggerPwaInstall,
} from "@/lib/pwaInstall";

const DISMISS_KEY = "pwa-install-dismissed";

export function PwaInstall() {
  const t = useTranslations("PwaInstall");
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    registerPwa();

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || "0");
    const suppressed = dismissedAt && Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000;
    if (suppressed) setDismissed(true);

    const sync = () => {
      const s = getPwaInstallState();
      setAvailable(s.available && !s.installed);
    };
    sync();
    const off = onPwaStateChange(sync);
    return off;
  }, []);

  async function install() {
    await triggerPwaInstall();
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  if (!available || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 card p-3 flex items-center gap-3 shadow-lg max-w-sm">
      <Download size={18} className="text-[var(--accent)] flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <div className="font-medium">{t("title")}</div>
        <div className="text-xs text-[var(--muted)]">{t("description")}</div>
      </div>
      <button onClick={install} className="btn btn-primary py-1 px-2 text-xs">
        {t("install")}
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-[var(--muted)] hover:text-white"
        title={t("dismissTitle")}
        aria-label={t("dismissAria")}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
