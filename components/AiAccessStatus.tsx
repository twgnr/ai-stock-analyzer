"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  DollarSign,
} from "lucide-react";
import { fmtCurrency } from "@/lib/format";

interface UsagePayload {
  usage: { dayUsd: number; monthUsd: number };
  access: {
    hasOwnKey: boolean;
    hasAnyAccess: boolean;
    activeSource: "user" | "shared" | "none";
  };
  sharedLimits: {
    sharedKeyAvailable: boolean;
    allowSharedKeyUsage: boolean;
    dailyLimitUsd: number;
    monthlyLimitUsd: number;
    dayRemainingUsd: number | null;
    monthRemainingUsd: number | null;
  };
}

export function AiAccessStatus() {
  const t = useTranslations("Settings.aiAccess");
  const locale = useLocale();
  const [data, setData] = useState<UsagePayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/me", { cache: "no-store" });
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return null;

  const { access, sharedLimits, usage } = data;

  // User hat eigenen Key → keine Hinweise nötig, ist sauber
  if (access.hasOwnKey) {
    return (
      <div className="card p-3 text-xs text-[var(--muted)] flex items-center gap-2">
        <CheckCircle2 size={13} className="text-[var(--green)]" />
        <span dangerouslySetInnerHTML={{ __html: t.raw("ownKey") as string }} />
      </div>
    );
  }

  // Kein eigener Key + kein Access
  if (!access.hasAnyAccess) {
    const reason = !sharedLimits.sharedKeyAvailable
      ? t("reasonNoSharedKey")
      : !sharedLimits.allowSharedKeyUsage
        ? t("reasonSharedDisabled")
        : t("reasonLimitExceeded");
    return (
      <div className="card p-3 text-sm text-[var(--red)] bg-red-500/10 border-red-500/30 flex items-start gap-2">
        <XCircle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">{t("noAccessTitle")}</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {t("noAccessBody", { reason })}
          </div>
        </div>
      </div>
    );
  }

  const monthLabel = new Date().toLocaleDateString(
    locale === "de" ? "de-DE" : "en-US",
    { month: "long" }
  );

  // Shared-Access aktiv
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Users size={14} className="text-[var(--accent)]" />
        <span
          dangerouslySetInnerHTML={{ __html: t.raw("sharedActive") as string }}
        />
      </div>
      <div className="text-xs text-[var(--muted)]">{t("sharedBody")}</div>

      {(sharedLimits.dailyLimitUsd > 0 || sharedLimits.monthlyLimitUsd > 0) && (
        <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[var(--border)]">
          <UsageBox
            label={t("today")}
            usedUsd={usage.dayUsd}
            limitUsd={sharedLimits.dailyLimitUsd}
            remainingUsd={sharedLimits.dayRemainingUsd}
            noLimitLabel={t("noLimit")}
            remainingPrefix={(amount) => t("remaining", { amount })}
          />
          <UsageBox
            label={monthLabel}
            usedUsd={usage.monthUsd}
            limitUsd={sharedLimits.monthlyLimitUsd}
            remainingUsd={sharedLimits.monthRemainingUsd}
            noLimitLabel={t("noLimit")}
            remainingPrefix={(amount) => t("remaining", { amount })}
          />
        </div>
      )}
    </div>
  );
}

function UsageBox({
  label,
  usedUsd,
  limitUsd,
  remainingUsd,
  noLimitLabel,
  remainingPrefix,
}: {
  label: string;
  usedUsd: number;
  limitUsd: number;
  remainingUsd: number | null;
  noLimitLabel: string;
  remainingPrefix: (amount: string) => string;
}) {
  if (limitUsd <= 0) {
    return (
      <div className="flex items-center gap-2">
        <DollarSign size={12} className="text-[var(--muted)]" />
        <span>
          {label}: <span className="num">{fmtCurrency(usedUsd, "USD")}</span>{" "}
          <span className="text-[var(--muted)]">· {noLimitLabel}</span>
        </span>
      </div>
    );
  }
  const pct = Math.min(100, (usedUsd / limitUsd) * 100);
  const warn = pct >= 80;
  return (
    <div>
      <div className="flex items-center gap-1">
        {warn && <AlertTriangle size={11} className="text-yellow-400" />}
        <span>{label}</span>
      </div>
      <div className="num">
        {fmtCurrency(usedUsd, "USD")} / {fmtCurrency(limitUsd, "USD")}
      </div>
      <div className="h-1 bg-[var(--surface-2)] rounded mt-1 overflow-hidden">
        <div
          className={`h-full ${warn ? "bg-yellow-400" : "bg-[var(--accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {remainingUsd != null && (
        <div className="text-[10px] text-[var(--muted)] mt-0.5">
          {remainingPrefix(fmtCurrency(remainingUsd, "USD"))}
        </div>
      )}
    </div>
  );
}
