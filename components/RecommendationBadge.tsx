"use client";

import { useTranslations } from "next-intl";

interface Props {
  recommendation: string;
}

const styleMap: Record<string, string> = {
  BUY: "badge-buy",
  SELL: "badge-sell",
  HOLD: "badge-hold",
  ACCUMULATE: "badge-accumulate",
  REDUCE: "badge-reduce",
};

type LabelKey = "BUY" | "SELL" | "HOLD" | "ACCUMULATE" | "REDUCE";
const KNOWN_RECOS: ReadonlySet<LabelKey> = new Set<LabelKey>([
  "BUY",
  "SELL",
  "HOLD",
  "ACCUMULATE",
  "REDUCE",
]);

export function RecommendationBadge({ recommendation }: Props) {
  const t = useTranslations("Recommendation.labels");
  const cls = styleMap[recommendation] || "badge-hold";
  const label = KNOWN_RECOS.has(recommendation as LabelKey)
    ? t(recommendation as LabelKey)
    : recommendation;
  return <span className={`badge ${cls}`}>{label}</span>;
}
