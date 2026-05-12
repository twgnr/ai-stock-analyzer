"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { ThesisPanel } from "@/components/ThesisPanel";

export default function ThesenPage() {
  const t = useTranslations("Thesen");
  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t("back")}
      </Link>

      <div className="flex items-center gap-2">
        <BookOpen size={22} className="text-[var(--accent)]" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t.rich("description", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>

      <ThesisPanel />
    </div>
  );
}
