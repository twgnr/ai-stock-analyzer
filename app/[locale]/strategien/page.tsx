import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Target,
  Coins,
  Rocket,
  Shield,
  TrendingDown,
  Zap,
  Filter,
} from "lucide-react";

// Strategie-Vorlagen: jede referenziert ein Screener-Preset per URL-Param.
// Der Screener liest den Preset beim Mount und initialisiert die Filter
// entsprechend. So bleibt ein einziger Ort (lib/screener.ts) die Source of
// Truth für die tatsächlichen Filter-Werte.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Strategies" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

type StrategyKey =
  | "value"
  | "dividend-growth"
  | "growth"
  | "momentum"
  | "contrarian"
  | "defensive";

type IconKey =
  | "target"
  | "coins"
  | "rocket"
  | "shield"
  | "contrarian"
  | "momentum";

interface Strategy {
  id: StrategyKey;
  icon: IconKey;
  screenerPreset?: "value" | "growth" | "dividend" | "oversold" | "momentum";
}

const STRATEGIES: Strategy[] = [
  { id: "value", icon: "target", screenerPreset: "value" },
  { id: "dividend-growth", icon: "coins", screenerPreset: "dividend" },
  { id: "growth", icon: "rocket", screenerPreset: "growth" },
  { id: "momentum", icon: "momentum", screenerPreset: "momentum" },
  { id: "contrarian", icon: "contrarian", screenerPreset: "oversold" },
  { id: "defensive", icon: "shield" },
];

function IconFor({ icon }: { icon: IconKey }) {
  const cls = "text-[var(--accent)]";
  if (icon === "target") return <Target size={18} className={cls} aria-hidden="true" />;
  if (icon === "coins") return <Coins size={18} className={cls} aria-hidden="true" />;
  if (icon === "rocket") return <Rocket size={18} className={cls} aria-hidden="true" />;
  if (icon === "shield") return <Shield size={18} className={cls} aria-hidden="true" />;
  if (icon === "momentum") return <Zap size={18} className={cls} aria-hidden="true" />;
  return <TrendingDown size={18} className={cls} aria-hidden="true" />;
}

export default async function StrategienPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Strategies" });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("back")}
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-[var(--muted)] text-sm">{t("intro")}</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {STRATEGIES.map((s) => (
          <div key={s.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <IconFor icon={s.icon} />
                <div>
                  <h2 className="font-semibold">{t(`strategies.${s.id}.label`)}</h2>
                  <div className="text-xs text-[var(--muted)]">
                    {t(`strategies.${s.id}.tagline`)}
                  </div>
                </div>
              </div>
              {s.screenerPreset && (
                <Link
                  href={`/screener?preset=${s.screenerPreset}`}
                  className="btn btn-primary text-xs"
                >
                  <Filter size={12} aria-hidden="true" /> {t("openInScreener")}
                </Link>
              )}
            </div>

            <p className="text-sm">{t(`strategies.${s.id}.description`)}</p>

            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                {t("criteriaHeading")}
              </div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                <li>{t(`strategies.${s.id}.bullet1`)}</li>
                <li>{t(`strategies.${s.id}.bullet2`)}</li>
                <li>{t(`strategies.${s.id}.bullet3`)}</li>
                <li>{t(`strategies.${s.id}.bullet4`)}</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[var(--border)]">
              <div>
                <div className="text-[var(--muted)] uppercase tracking-wider">
                  {t("historyHeading")}
                </div>
                <p>{t(`strategies.${s.id}.historical`)}</p>
              </div>
              <div>
                <div className="text-[var(--muted)] uppercase tracking-wider">
                  {t("risksHeading")}
                </div>
                <p>{t(`strategies.${s.id}.risks`)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
