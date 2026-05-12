"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { LineChart, KeyRound, AlertCircle } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("Auth.reset");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("errorMismatch"));
      return;
    }
    if (password.length < 10) {
      setError(t("errorWeak"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("fail"));
      router.replace("/");
      router.refresh();
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
        <form onSubmit={submit} className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <div>
            <label htmlFor="reset-password" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("password")}
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoFocus
              className="input"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : "reset-password-hint"}
            />
            <p id="reset-password-hint" className="text-xs text-[var(--muted)] mt-1">
              {t("passwordHint")}
            </p>
          </div>
          <div>
            <label htmlFor="reset-password-confirm" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("confirm")}
            </label>
            <input
              id="reset-password-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="input"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
            />
          </div>
          {error && (
            <div
              id="reset-error"
              role="alert"
              className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2"
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
            {loading ? <div className="spinner" /> : <KeyRound size={16} />}
            {t("submit")}
          </button>
          <Link href="/login" className="text-sm text-[var(--muted)] hover:text-white block text-center">
            {t("backToLogin")}
          </Link>
        </form>
      </div>
    </div>
  );
}
