import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

// Glossar: eine einzelne Stelle, an der alle verwendeten Begriffe erklärt
// werden. Alphabetisch sortiert. Jeder Eintrag bekommt eine stabile ID,
// sodass andere Seiten gezielt hinverlinken können (z.B.
// /glossar#sharpe-ratio).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Glossary" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

// Die anker-IDs für die einzelnen Einträge sind sprachunabhängig (so
// funktionieren Deep-Links wie /glossar#sharpe-ratio über beide Locales
// hinweg). Optional "related"-Schlüssel referenzieren andere Einträge.
interface GlossaryEntry {
  id: string;
  related?: string[];
}

const ENTRIES: GlossaryEntry[] = [
  { id: "aktie" },
  { id: "beta" },
  { id: "book-value" },
  { id: "cagr" },
  { id: "conviction-score", related: ["momentum", "kgv"] },
  { id: "cvar", related: ["var"] },
  { id: "dcf", related: ["wacc", "fcf"] },
  { id: "dividendenrendite" },
  { id: "drawdown" },
  { id: "ebit" },
  { id: "ebitda" },
  { id: "eps" },
  { id: "fcf" },
  { id: "faktor-exposure", related: ["value", "growth", "momentum"] },
  { id: "forward-pe" },
  { id: "gordon-growth" },
  { id: "growth" },
  { id: "kgv", related: ["forward-pe", "eps"] },
  { id: "kbv", related: ["book-value"] },
  { id: "monte-carlo" },
  { id: "momentum" },
  { id: "net-debt" },
  { id: "payout-ratio" },
  { id: "peer-compare" },
  { id: "portfolio-health", related: ["faktor-exposure", "hhi"] },
  { id: "quality" },
  { id: "rebalance" },
  { id: "reverse-dcf", related: ["dcf"] },
  { id: "roe" },
  { id: "sharpe-ratio", related: ["sortino-ratio"] },
  { id: "short-interest" },
  { id: "size" },
  { id: "sortino-ratio" },
  { id: "stress-test" },
  { id: "twr" },
  { id: "value" },
  { id: "var", related: ["cvar"] },
  { id: "vix" },
  { id: "volatilitaet" },
  { id: "wacc", related: ["dcf"] },
  { id: "yield-curve" },
  { id: "hhi" },
];

export default async function GlossarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Glossary" });

  // Begriffe in der Locale-Sortierreihenfolge sortieren (Umlaute etc.).
  const sorted = [...ENTRIES]
    .map((e) => ({ ...e, term: t(`entries.${e.id}.term`) }))
    .sort((a, b) => a.term.localeCompare(b.term, locale));

  const byLetter = new Map<string, typeof sorted>();
  for (const e of sorted) {
    const letter = e.term[0].toUpperCase();
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter)!.push(e);
  }
  const letters = [...byLetter.keys()];

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-sm leading-relaxed">
      <Link
        href="/hilfe"
        className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("backToHelp")}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-[var(--accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <p className="text-[var(--muted)]">
          {t.rich("intro", {
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
      </header>

      <nav
        aria-label={t("indexLabel")}
        className="card p-3 flex flex-wrap gap-1 text-sm"
      >
        {letters.map((l) => (
          <a
            key={l}
            href={`#letter-${l}`}
            className="min-w-8 text-center px-2 py-1 rounded hover:bg-[var(--surface-2)]"
          >
            {l}
          </a>
        ))}
      </nav>

      {letters.map((letter) => (
        <section key={letter} id={`letter-${letter}`} className="space-y-3 scroll-mt-24">
          <h2 className="text-lg font-semibold text-[var(--accent)]">{letter}</h2>
          <dl className="space-y-4">
            {byLetter.get(letter)!.map((e) => {
              const short = t.has(`entries.${e.id}.short`)
                ? t(`entries.${e.id}.short`)
                : null;
              return (
                <div key={e.id} id={e.id} className="scroll-mt-24">
                  <dt className="font-semibold">
                    {e.term}
                    {short && (
                      <span className="text-[var(--muted)] font-normal"> — {short}</span>
                    )}
                  </dt>
                  <dd className="text-[var(--foreground)] mt-1">
                    {t(`entries.${e.id}.description`)}
                  </dd>
                  {e.related && e.related.length > 0 && (
                    <dd className="text-xs text-[var(--muted)] mt-1">
                      {t("seeAlso")}{" "}
                      {e.related.map((r, i) => (
                        <span key={r}>
                          <a href={`#${r}`} className="underline hover:text-[var(--foreground)]">
                            {t(`entries.${r}.term`)}
                          </a>
                          {i < e.related!.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
