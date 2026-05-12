"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import { INDICATORS, type IndicatorKey } from "@/lib/chartIndicators";

interface Props {
  active: Set<IndicatorKey>;
  onChange: (next: Set<IndicatorKey>) => void;
}

export function IndicatorSelector({ active, onChange }: Props) {
  const t = useTranslations("AnalysisPanels.indicators.selector");
  const tCat = useTranslations("AnalysisPanels.indicators.selector.categories");
  const [open, setOpen] = useState(false);

  function toggle(key: IndicatorKey) {
    const next = new Set(active);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function clearAll() {
    onChange(new Set());
  }

  const byCat: Record<string, typeof INDICATORS> = {};
  for (const ind of INDICATORS) {
    (byCat[ind.category] = byCat[ind.category] || []).push(ind);
  }
  // INDICATORS.category-Strings sind die DE-Kategorienamen — werden als Keys
  // an tCat() weitergegeben und dort übersetzt.
  const categoryOrder = ["Gleitender Durchschnitt", "Trendfolge", "Oscillator"] as const;
  type CategoryKey = (typeof categoryOrder)[number];

  const activeList = INDICATORS.filter((i) => active.has(i.key));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn text-xs"
        title={t("tooltip")}
      >
        <LineChartIcon size={12} />
        {t("title")}
        {active.size > 0 && (
          <span className="bg-[var(--accent)] text-white rounded-full px-1.5 text-[10px]">
            {active.size}
          </span>
        )}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 w-72 card z-40 overflow-hidden shadow-lg">
            <div className="p-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                {t("activeLabel", { count: active.size })}
              </span>
              {active.size > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-[var(--muted)] hover:text-[var(--red)]"
                >
                  {t("clearAll")}
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {categoryOrder.map((cat) => {
                const items = byCat[cat];
                if (!items) return null;
                return (
                  <div key={cat}>
                    <div className="px-3 py-1.5 bg-[var(--surface-2)] text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                      {tCat(cat as CategoryKey)}
                    </div>
                    {items.map((ind) => {
                      const on = active.has(ind.key);
                      return (
                        <label
                          key={ind.key}
                          data-help={`indicator:${ind.key}`}
                          className="flex items-start gap-2 px-3 py-2 hover:bg-[var(--surface-2)] cursor-pointer border-b border-[var(--border)] last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(ind.key)}
                            className="mt-0.5 accent-[var(--accent)]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              <span className="font-mono text-xs font-semibold mr-2">
                                {ind.abbrev}
                              </span>
                              {ind.label}
                            </div>
                            <div className="text-[10px] text-[var(--muted)]">
                              {ind.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {activeList.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 justify-end">
          {activeList.map((ind) => (
            <span
              key={ind.key}
              data-help={`indicator:${ind.key}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-[var(--accent)] font-mono"
              title={ind.label}
            >
              {ind.abbrev}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
