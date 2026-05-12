"use client";

import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import { estimateCallCost, formatCostUsd } from "@/lib/aiCostEstimate";
import type { AIProvider } from "@/lib/ai/types";

interface Props {
  /** Provider-Liste — bei mehreren wird die Summe geschätzt (Consensus-Use-Case). */
  providers: { provider: AIProvider; model: string }[];
  /** Promt-Text (System+User zusammen), so groß wie er an die KI gehen wird. */
  promptText: string;
  /** maxTokens der Operation. */
  expectedOutputTokens: number;
  /** Optionaler Suffix-Text für Tooltip. */
  hint?: string;
  className?: string;
}

/**
 * Klein, unaufdringlich. Zeigt eine grobe Vorab-Kosten-Schätzung neben einem
 * Action-Button. Beim Hover gibt's Detail-Tooltip.
 */
export function EstimatedCostBadge({
  providers,
  promptText,
  expectedOutputTokens,
  hint,
  className = "",
}: Props) {
  const t = useTranslations("Badges.estimatedCost");
  if (providers.length === 0) return null;
  const perProvider = providers.map((p) => ({
    ...p,
    estimate: estimateCallCost({
      provider: p.provider,
      model: p.model,
      promptText,
      expectedOutputTokens,
    }),
  }));
  const total = perProvider.reduce((s, x) => s + x.estimate.costUsd, 0);

  const summary =
    providers.length > 1
      ? t("summaryMulti", { cost: formatCostUsd(total), count: providers.length })
      : t("summary", { cost: formatCostUsd(total) });

  const tooltip = [
    summary,
    ...perProvider.map(
      (p) =>
        `${p.provider}:${p.model} → ${p.estimate.formatted} (${p.estimate.inputTokens} in / ${p.estimate.outputTokens} out)`
    ),
    hint,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-[var(--muted)] ${className}`}
      title={tooltip}
    >
      <Coins size={11} aria-hidden="true" />
      ~{formatCostUsd(total)}
    </span>
  );
}
