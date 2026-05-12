"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LineChart, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth.forgot");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("fail"));
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("fail"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <LineChart size={24} className="text-[var(--accent)]" />
          <h1 className="text-xl font-semibold">AI Stock Analyzer</h1>
        </div>

        {sent ? (
          <div className="card p-6 space-y-3">
            <div className="flex items-center gap-2 text-[var(--green)]">
              <CheckCircle2 size={20} />
              <h2 className="text-lg font-semibold">{t("sentTitle")}</h2>
            </div>
            <p
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: t("sentBody", { email }) }}
            />
            <p className="text-xs text-[var(--muted)]">{t("sentHint")}</p>
            <Link href="/login" className="btn w-full justify-center">
              {t("backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("intro")}</p>
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("email")}
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="input"
                autoComplete="email"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "forgot-error" : undefined}
              />
            </div>
            {error && (
              <div
                id="forgot-error"
                role="alert"
                className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2"
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center"
            >
              {loading ? <div className="spinner" /> : <Mail size={16} />}
              {t("submit")}
            </button>
            <Link href="/login" className="text-sm text-[var(--muted)] hover:text-white block text-center">
              {t("backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
