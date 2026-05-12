"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Download,
  Rocket,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Palette,
  Box,
  Globe,
} from "lucide-react";
import { startOnboardingTour } from "@/components/OnboardingTour";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThreeDToggle } from "@/components/ThreeDToggle";
import { AccentColorPicker } from "@/components/AccentColorPicker";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  getPwaInstallState,
  onPwaStateChange,
  triggerPwaInstall,
} from "@/lib/pwaInstall";

export function AppPreferencesCard() {
  const t = useTranslations("Settings.preferences");
  const tSwitcher = useTranslations("LanguageSwitcher");
  const currentLocale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pwaState, setPwaState] = useState<{ available: boolean; installed: boolean }>({
    available: false,
    installed: false,
  });
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [savingLocale, startLocaleSave] = useTransition();
  const [localeMessage, setLocaleMessage] = useState<string | null>(null);

  async function switchLocale(next: Locale) {
    if (next === currentLocale) return;
    setLocaleMessage(null);
    // 1) User-Preferenz in der DB persistieren — wird für Mails benutzt
    //    (Verifikation, Alerts, Digests). Fehler werden geschluckt — die
    //    UI-Sprache ändern wir trotzdem, der Cookie reicht für sofortiges
    //    Verhalten.
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (res.ok) {
        setLocaleMessage(t("languageSaved"));
      } else {
        setLocaleMessage(t("languageError"));
      }
    } catch {
      setLocaleMessage(t("languageError"));
    }
    // 2) UI-Locale wechseln — next-intl-Router setzt das NEXT_LOCALE-Cookie
    //    und navigiert auf den gleichen Pfad in der neuen Sprache.
    startLocaleSave(() => {
      router.replace(pathname, { locale: next });
    });
    setTimeout(() => setLocaleMessage(null), 4000);
  }

  useEffect(() => {
    const sync = () => setPwaState(getPwaInstallState());
    sync();
    const off = onPwaStateChange(sync);
    return off;
  }, []);

  async function install() {
    setInstalling(true);
    setInstallMessage(null);
    const outcome = await triggerPwaInstall();
    setInstalling(false);
    if (outcome === "accepted") setInstallMessage(t("installStarted"));
    else if (outcome === "dismissed") setInstallMessage(t("installCancelled"));
    else setInstallMessage(null);
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Palette size={13} className="text-[var(--muted)]" aria-hidden="true" />
          {t("appearance")}
        </div>
        <div className="text-xs text-[var(--muted)]">{t("appearanceBody")}</div>
        <ThemeToggle />
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Palette size={13} className="text-[var(--muted)]" aria-hidden="true" />
          {t("accent")}
        </div>
        <div className="text-xs text-[var(--muted)]">{t("accentBody")}</div>
        <AccentColorPicker />
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Box size={13} className="text-[var(--muted)]" aria-hidden="true" />
          {t("threeDTitle")}
        </div>
        <div className="text-xs text-[var(--muted)]">{t("threeDBody")}</div>
        <ThreeDToggle />
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <div className="text-sm font-medium">{t("installTitle")}</div>
        <div className="text-xs text-[var(--muted)]">{t("installBody")}</div>

        {pwaState.installed ? (
          <div className="text-sm text-[var(--green)] inline-flex items-center gap-2">
            <CheckCircle2 size={14} aria-hidden="true" />
            {t("installed")}
          </div>
        ) : pwaState.available ? (
          <button
            onClick={install}
            disabled={installing}
            className="btn btn-primary text-sm"
          >
            {installing ? <div className="spinner" /> : <Download size={14} aria-hidden="true" />}
            {t("installNow")}
          </button>
        ) : (
          <div className="text-xs text-[var(--muted)] inline-flex items-center gap-2">
            <AlertCircle size={12} aria-hidden="true" />
            {t("noInstall")}
          </div>
        )}

        {installMessage && (
          <div className="text-xs text-[var(--muted)]">{installMessage}</div>
        )}
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Globe size={13} className="text-[var(--muted)]" aria-hidden="true" />
          {t("languageTitle")}
        </div>
        <div className="text-xs text-[var(--muted)]">{t("languageBody")}</div>
        <div className="inline-flex border border-[var(--border)] rounded-md overflow-hidden" role="radiogroup" aria-label={tSwitcher("label")}>
          {routing.locales.map((l) => {
            const active = l === currentLocale;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={savingLocale || active}
                onClick={() => switchLocale(l as Locale)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {tSwitcher(l as "de" | "en")}
              </button>
            );
          })}
        </div>
        {savingLocale && (
          <div className="text-xs text-[var(--muted)]">{t("languageSaving")}</div>
        )}
        {localeMessage && !savingLocale && (
          <div className="text-xs text-[var(--muted)]">{localeMessage}</div>
        )}
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <div className="text-sm font-medium">{t("tourTitle")}</div>
        <div className="text-xs text-[var(--muted)]">{t("tourBody")}</div>
        <button
          onClick={() => startOnboardingTour()}
          className="btn text-sm"
        >
          <Rocket size={14} aria-hidden="true" /> {t("tourRestart")}
        </button>
      </div>
    </div>
  );
}
