"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Rocket,
  KeyRound,
  Briefcase,
  Eye,
  HeartPulse,
  BookOpen,
  X,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  Bell,
  Compass,
  MessageCircle,
  Newspaper,
  Sparkles,
  Globe2,
  Trophy,
  Filter,
  type LucideIcon,
} from "lucide-react";

const STORAGE_KEY = "sa.onboardingSeen.v1";
/** Aktive (möglicherweise minimierte) Tour speichert hier den aktuellen Step.
 *  Wert ist eine Zahl als String. Ist der Key gelöscht, läuft keine Tour. */
const PROGRESS_KEY = "sa.onboardingProgress.v1";
const OPEN_EVENT = "sa:open-onboarding";
const PROGRESS_EVENT = "sa:onboarding-progress";

/**
 * Kann von anderen Komponenten (z.B. Settings) aufgerufen werden, um die
 * Tour erneut zu öffnen, auch wenn sie schon einmal abgeschlossen wurde.
 */
export function startOnboardingTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

interface StepDef {
  key: string;
  icon: LucideIcon;
  /** Liefert den Body via t(). Belassen wir als Renderfunktion, damit der
   *  jeweilige Step nur seine eigenen Keys nimmt. */
  Body: React.FC;
  primaryHref?: string;
  primaryLabelKey?: string;
}

// Reiner Stub-Component-Helper zum Aufruf von t() im Step-Body — ohne wir
// müssten t() in jedem Step-Body manuell durchreichen.
function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function PHtml({ html }: { html: string }) {
  return <p dangerouslySetInnerHTML={{ __html: html }} />;
}

function LiHtml({ html }: { html: string }) {
  return <li dangerouslySetInnerHTML={{ __html: html }} />;
}

function WelcomeBody() {
  const t = useTranslations("OnboardingTour.steps.welcome");
  return (
    <>
      <P>{t("bodyP1")}</P>
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function DataSourcesBody() {
  const t = useTranslations("OnboardingTour.steps.dataSources");
  return (
    <>
      <P>{t("bodyIntro")}</P>
      <ul className="text-xs space-y-1 ml-2">
        <LiHtml html={t.raw("sourceYahooHtml") as string} />
        <LiHtml html={t.raw("sourceFinnhubHtml") as string} />
        <LiHtml html={t.raw("sourceStooqHtml") as string} />
        <LiHtml html={t.raw("sourceRedditHtml") as string} />
        <LiHtml html={t.raw("sourceFredHtml") as string} />
        <LiHtml html={t.raw("sourceSecHtml") as string} />
        <LiHtml html={t.raw("sourceWikipediaHtml") as string} />
        <LiHtml html={t.raw("sourceTrendsHtml") as string} />
        <LiHtml html={t.raw("sourceEcbHtml") as string} />
        <LiHtml html={t.raw("sourceMagazineHtml") as string} />
      </ul>
      <p
        className="text-xs"
        dangerouslySetInnerHTML={{ __html: t.raw("keysNoteHtml") as string }}
      />
    </>
  );
}

function AiAccessBody() {
  const t = useTranslations("OnboardingTour.steps.aiAccess");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function DashboardBody() {
  const t = useTranslations("OnboardingTour.steps.dashboard");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function PortfolioBody() {
  const t = useTranslations("OnboardingTour.steps.portfolio");
  return (
    <>
      <P>{t("bodyP1")}</P>
      <P>{t("bodyP2")}</P>
    </>
  );
}

function WatchlistBody() {
  const t = useTranslations("OnboardingTour.steps.watchlist");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function AiAnalysisBody() {
  const t = useTranslations("OnboardingTour.steps.aiAnalysis");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function RiskBody() {
  const t = useTranslations("OnboardingTour.steps.risk");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function MacroBody() {
  const t = useTranslations("OnboardingTour.steps.macro");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function MarketRadarBody() {
  const t = useTranslations("OnboardingTour.steps.marketRadar");
  return (
    <>
      <PHtml html={t.raw("bodyIntroHtml") as string} />
      <ul className="text-xs space-y-0.5 ml-2">
        <li>{t("li1")}</li>
        <li>{t("li2")}</li>
        <li>{t("li3")}</li>
      </ul>
    </>
  );
}

function ScreenerBody() {
  const t = useTranslations("OnboardingTour.steps.screener");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
      <PHtml html={t.raw("bodyP3Html") as string} />
    </>
  );
}

function TrackRecordBody() {
  const t = useTranslations("OnboardingTour.steps.trackRecord");
  return <PHtml html={t.raw("bodyHtml") as string} />;
}

function ChatBody() {
  const t = useTranslations("OnboardingTour.steps.chat");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
    </>
  );
}

function PersonalizationBody() {
  const t = useTranslations("OnboardingTour.steps.personalization");
  return (
    <>
      <PHtml html={t.raw("bodyIntroHtml") as string} />
      <ul className="text-xs space-y-0.5 ml-2">
        <LiHtml html={t.raw("li1Html") as string} />
        <LiHtml html={t.raw("li2Html") as string} />
        <LiHtml html={t.raw("li3Html") as string} />
        <LiHtml html={t.raw("li4Html") as string} />
        <LiHtml html={t.raw("li5Html") as string} />
        <LiHtml html={t.raw("li6Html") as string} />
      </ul>
    </>
  );
}

function ShortcutsBody() {
  const t = useTranslations("OnboardingTour.steps.shortcuts");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <P>{t("bodyP2")}</P>
    </>
  );
}

function HelpBody() {
  const t = useTranslations("OnboardingTour.steps.help");
  return (
    <>
      <PHtml html={t.raw("bodyP1Html") as string} />
      <PHtml html={t.raw("bodyP2Html") as string} />
      <p className="text-xs text-[var(--muted)]">{t("disclaimer")}</p>
    </>
  );
}

const STEPS: StepDef[] = [
  { key: "welcome", icon: Rocket, Body: WelcomeBody },
  { key: "dataSources", icon: Database, Body: DataSourcesBody },
  {
    key: "aiAccess",
    icon: KeyRound,
    Body: AiAccessBody,
    primaryHref: "/hilfe#api-keys",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "dashboard",
    icon: LayoutDashboard,
    Body: DashboardBody,
    primaryHref: "/",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "portfolio",
    icon: Briefcase,
    Body: PortfolioBody,
    primaryHref: "/portfolio",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "watchlist",
    icon: Eye,
    Body: WatchlistBody,
    primaryHref: "/watchlist",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "aiAnalysis",
    icon: Sparkles,
    Body: AiAnalysisBody,
    primaryHref: "/discoveries",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "risk",
    icon: HeartPulse,
    Body: RiskBody,
    primaryHref: "/portfolio/risk",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "macro",
    icon: Globe2,
    Body: MacroBody,
    primaryHref: "/macro-scenario",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "marketRadar",
    icon: Newspaper,
    Body: MarketRadarBody,
    primaryHref: "/market",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "screener",
    icon: Filter,
    Body: ScreenerBody,
    primaryHref: "/screener",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "trackRecord",
    icon: Trophy,
    Body: TrackRecordBody,
    primaryHref: "/insights/track-record",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "chat",
    icon: MessageCircle,
    Body: ChatBody,
    primaryHref: "/chat",
    primaryLabelKey: "linkLabel",
  },
  {
    key: "personalization",
    icon: Bell,
    Body: PersonalizationBody,
    primaryHref: "/settings",
    primaryLabelKey: "linkLabel",
  },
  { key: "shortcuts", icon: Compass, Body: ShortcutsBody },
  {
    key: "help",
    icon: BookOpen,
    Body: HelpBody,
    primaryHref: "/hilfe",
    primaryLabelKey: "linkLabel",
  },
];

export function OnboardingTour() {
  const t = useTranslations("OnboardingTour");
  const tSteps = useTranslations("OnboardingTour.steps");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  /** Tour läuft im Hintergrund (FAB sichtbar), Modal aber zu. */
  const [active, setActive] = useState(false);

  // Persistierung des aktuellen Steps, sodass die Tour Page-Wechsel überlebt.
  function persistProgress(s: number) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PROGRESS_KEY, String(s));
      window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
    } catch {}
  }
  function clearProgress() {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(PROGRESS_KEY);
      window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
    } catch {}
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Beim Mount: läuft schon eine Tour (anderer Tab, Page-Wechsel)?
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < STEPS.length) {
        setStep(parsed);
        setActive(true);
      }
    }

    // Erstbesucher: Tour automatisch nach kurzer Verzögerung einblenden
    let firstRunTimer: ReturnType<typeof setTimeout> | null = null;
    if (!localStorage.getItem(STORAGE_KEY) && stored === null) {
      firstRunTimer = setTimeout(() => {
        setStep(0);
        setActive(true);
        setOpen(true);
        persistProgress(0);
      }, 400);
    }

    const openHandler = () => {
      setStep(0);
      setActive(true);
      setOpen(true);
      persistProgress(0);
    };
    window.addEventListener(OPEN_EVENT, openHandler);

    // Cross-Tab-/Cross-Component-Sync: wenn ein anderer Tab den Progress
    // verändert, holen wir uns hier die Updates.
    function onProgress() {
      const v = localStorage.getItem(PROGRESS_KEY);
      if (v === null) {
        setActive(false);
        setOpen(false);
        return;
      }
      const p = parseInt(v, 10);
      if (Number.isFinite(p)) {
        setStep(p);
        setActive(true);
      }
    }
    window.addEventListener(PROGRESS_EVENT, onProgress);
    function onStorage(e: StorageEvent) {
      if (e.key === PROGRESS_KEY) onProgress();
    }
    window.addEventListener("storage", onStorage);

    return () => {
      if (firstRunTimer) clearTimeout(firstRunTimer);
      window.removeEventListener(OPEN_EVENT, openHandler);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /** Step ändern — auch in localStorage spiegeln. */
  function gotoStep(next: number) {
    setStep(next);
    persistProgress(next);
  }

  /** Modal nur schließen (für Navigation), Tour bleibt aktiv → FAB taucht auf. */
  function minimize() {
    setOpen(false);
  }

  /** Tour endgültig beenden (X / Skip / „Los geht's"). */
  function finish() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch {}
    }
    clearProgress();
    setOpen(false);
    setActive(false);
  }

  /** Reopen aus dem FAB. */
  function resume() {
    setOpen(true);
  }

  // Wenn weder Modal offen noch Tour aktiv → komplett unsichtbar.
  if (!open && !active) return null;

  // FAB-Modus: Tour ist aktiv aber Modal zu (z. B. nach primaryLink-Click).
  if (!open && active) {
    return (
      <button
        type="button"
        onClick={resume}
        className="fixed bottom-4 right-4 z-50 btn btn-primary text-sm shadow-lg"
        aria-label={t("resumeAria")}
        title={t("resumeTitle")}
      >
        <Rocket size={14} aria-hidden="true" />
        {t("resume", { current: step + 1, total: STEPS.length })}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
          className="ml-1 -mr-1 p-0.5 hover:bg-white/20 rounded"
          aria-label={t("endAria")}
          title={t("endTitle")}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </button>
    );
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const Body = current.Body;
  const isLast = step === STEPS.length - 1;
  const title = tSteps(`${current.key}.title` as never);
  const primaryLabel = current.primaryLabelKey
    ? tSteps(`${current.key}.${current.primaryLabelKey}` as never)
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="card p-6 max-w-lg w-full space-y-4 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={finish}
          className="absolute top-3 right-3 p-1 text-[var(--muted)] hover:text-white"
          aria-label={t("skipAria")}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
            <Icon size={20} className="text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[var(--muted)]">
              {t("stepCounter", { current: step + 1, total: STEPS.length })}
            </div>
            <h2 id="onboarding-title" className="text-lg font-semibold">
              {title}
            </h2>
          </div>
        </div>

        <div className="space-y-2 text-sm text-[var(--foreground)]/90">
          <Body />
        </div>

        {current.primaryHref && primaryLabel && (
          <Link
            href={current.primaryHref}
            onClick={minimize}
            className="btn btn-primary text-sm"
          >
            {primaryLabel}
          </Link>
        )}
        {current.primaryHref && primaryLabel && (
          <p className="text-xs text-[var(--muted)] -mt-2">
            {t("primaryLinkHint")}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border)] sticky bottom-0 bg-[var(--surface)]">
          <button onClick={finish} className="text-xs text-[var(--muted)] hover:text-white">
            {t("skip")}
          </button>
          <div className="flex gap-2">
            <button onClick={minimize} className="btn text-xs" title={t("laterTitle")}>
              {t("later")}
            </button>
            {step > 0 && (
              <button onClick={() => gotoStep(step - 1)} className="btn text-sm">
                <ChevronLeft size={14} aria-hidden="true" /> {t("back")}
              </button>
            )}
            {!isLast ? (
              <button onClick={() => gotoStep(step + 1)} className="btn btn-primary text-sm">
                {t("next")} <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button onClick={finish} className="btn btn-primary text-sm">
                {t("finish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
