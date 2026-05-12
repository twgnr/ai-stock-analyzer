"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LineChart, UserPlus, AlertCircle, Clock } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";

export default function RegisterPage() {
  const t = useTranslations("Auth.register");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      setError(t("errorEmailMismatch"));
      return;
    }
    if (password !== confirm) {
      setError(t("errorPasswordMismatch"));
      return;
    }
    if (password.length < 10) {
      setError(t("errorPasswordShort"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("fail"));
      if (data.pendingApproval) {
        setPendingApproval(true);
        return;
      }
      router.replace("/settings");
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
        {pendingApproval ? (
          <div className="card p-6 space-y-3 text-center">
            <Clock size={32} className="text-yellow-400 mx-auto" />
            <h2 className="text-lg font-semibold">{t("pendingTitle")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("pendingBody1")}</p>
            <p className="text-sm text-[var(--muted)]">{t("pendingBody2")}</p>
            <Link href="/login" className="btn btn-primary w-full justify-center">
              {t("pendingBack")}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("name")}
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("email")}
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                autoComplete="email"
                aria-describedby={error ? "reg-error" : undefined}
              />
            </div>
            <div>
              <label htmlFor="reg-email-confirm" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("emailConfirm")}
              </label>
              <input
                id="reg-email-confirm"
                type="email"
                value={emailConfirm}
                onChange={(e) => setEmailConfirm(e.target.value)}
                required
                className="input"
                autoComplete="off"
                onPaste={(e) => e.preventDefault()}
                aria-describedby={error ? "reg-error" : undefined}
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("password")}
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                className="input"
                autoComplete="new-password"
                aria-describedby={error ? "reg-error" : "reg-password-hint"}
              />
              <p id="reg-password-hint" className="text-xs text-[var(--muted)] mt-1">
                {t("passwordHint")}
              </p>
            </div>
            <div>
              <label htmlFor="reg-password-confirm" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("passwordConfirm")}
              </label>
              <input
                id="reg-password-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="input"
                autoComplete="new-password"
                aria-describedby={error ? "reg-error" : undefined}
              />
            </div>
            {error && (
              <div
                id="reg-error"
                role="alert"
                className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2"
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
              {loading ? <div className="spinner" /> : <UserPlus size={16} />}
              {t("submit")}
            </button>
            <div className="text-sm text-[var(--muted)] text-center">
              {t("alreadyAccount")}{" "}
              <Link href="/login" className="hover:text-white">
                {t("loginLink")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
