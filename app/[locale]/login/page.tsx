"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LineChart, LogIn, AlertCircle, Megaphone } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";

function LoginForm() {
  const t = useTranslations("Auth.login");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/login-notice", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled && typeof d.text === "string" && d.text.trim().length > 0) {
          setNotice(d.text);
        }
      })
      .catch(() => {
        // Fehler still schlucken — der Hinweis ist nur optional.
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          totpCode: requiresTotp ? totpCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresTotp) {
          setRequiresTotp(true);
          setError(requiresTotp ? data.error : null);
        } else {
          throw new Error(data.error || t("fail"));
        }
        return;
      }
      const next = params.get("next") || "/";
      router.replace(next);
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
        {notice && (
          <div
            role="note"
            aria-label={t("notice")}
            className="card p-4 mb-4 border-[var(--accent)]/30 bg-[var(--accent)]/5"
          >
            <div className="flex items-start gap-2">
              <Megaphone
                size={16}
                className="text-[var(--accent)] flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="text-sm whitespace-pre-line">{notice}</div>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("email")}
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="input"
              autoComplete="email"
              aria-invalid={error && !requiresTotp ? true : undefined}
              aria-describedby={error && !requiresTotp ? "login-error" : undefined}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("password")}
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input"
              autoComplete="current-password"
              aria-invalid={error && !requiresTotp ? true : undefined}
              aria-describedby={error && !requiresTotp ? "login-error" : undefined}
            />
          </div>
          {requiresTotp && (
            <div>
              <label htmlFor="login-totp" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("twoFactorLabel")}
              </label>
              <input
                id="login-totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                placeholder="123456"
                className="input text-center text-lg tracking-widest font-mono"
                autoComplete="one-time-code"
                aria-invalid={error && requiresTotp ? true : undefined}
                aria-describedby={error && requiresTotp ? "login-error" : undefined}
              />
            </div>
          )}
          {error && (
            <div
              id="login-error"
              role="alert"
              className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2"
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
            {loading ? <div className="spinner" /> : <LogIn size={16} />}
            {requiresTotp ? t("confirmCode") : t("submit")}
          </button>
          <div className="text-sm text-[var(--muted)] flex justify-between">
            <Link href="/forgot-password" className="hover:text-white">
              {t("forgot")}
            </Link>
            <Link href="/register" className="hover:text-white">
              {t("register")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
