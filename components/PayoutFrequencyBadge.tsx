"use client";

import { useTranslations } from "next-intl";

type FrequencyKey = "monthly" | "quarterly" | "semiannual" | "annual" | "irregular" | "none";

const KNOWN: ReadonlySet<FrequencyKey> = new Set<FrequencyKey>([
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "irregular",
  "none",
]);

const TONE: Record<string, string> = {
  monthly: "border-[var(--green)]/40 text-[var(--green)]",
  quarterly: "border-[var(--accent)]/40 text-[var(--accent)]",
  semiannual: "border-yellow-500/40 text-yellow-400",
  annual: "border-[var(--border)] text-[var(--muted)]",
  irregular: "border-[var(--border)] text-[var(--muted)]",
  none: "border-[var(--border)] text-[var(--muted)]",
};

export function PayoutFrequencyBadge({
  frequency,
  payoutsPerYear,
}: {
  frequency: string;
  payoutsPerYear: number;
}) {
  const t = useTranslations("Badges.payoutFrequency");
  const tLabels = useTranslations("Badges.payoutFrequency.labels");
  const label = KNOWN.has(frequency as FrequencyKey)
    ? tLabels(frequency as FrequencyKey)
    : frequency;
  const tone = TONE[frequency] || "border-[var(--border)] text-[var(--muted)]";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 ${tone}`}
      title={t("title", { count: payoutsPerYear })}
      aria-label={t("ariaLabel", { label, count: payoutsPerYear })}
    >
      {label}
      <span className="opacity-60">· {t("perYear", { count: payoutsPerYear })}</span>
    </span>
  );
}
