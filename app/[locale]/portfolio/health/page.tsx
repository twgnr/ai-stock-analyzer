"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { PortfolioHealthCard } from "@/components/PortfolioHealthCard";

export default function PortfolioHealthPage() {
  const t = useTranslations("Portfolio");
  const th = useTranslations("Portfolio.health");
  return (
    <div className="space-y-6">
      <Link
        href="/portfolio"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("backToPortfolio")}
      </Link>

      <h1 className="text-2xl font-semibold">{th("title")}</h1>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {th("description")}
      </div>

      <PortfolioHealthCard detailed />
    </div>
  );
}
