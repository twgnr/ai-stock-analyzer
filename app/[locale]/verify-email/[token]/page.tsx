"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import { LineChart, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("Auth.verifyEmail");
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("fail"));
        setStatus("success");
        setVerifiedEmail(data.email || "");
      })
      .catch((e) => {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : t("fail"));
      });
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <LineChart size={24} className="text-[var(--accent)]" />
          <h1 className="text-xl font-semibold">AI Stock Analyzer</h1>
        </div>
        <div className="card p-6 text-center space-y-4">
          {status === "verifying" && (
            <>
              <div className="spinner mx-auto" />
              <p>{t("verifying")}</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 size={48} className="text-[var(--green)] mx-auto" />
              <h2 className="text-lg font-semibold">{t("successTitle")}</h2>
              {verifiedEmail && (
                <p className="text-sm text-[var(--muted)]">
                  {t("successBody", { email: verifiedEmail })}
                </p>
              )}
              <Link href="/" className="btn btn-primary w-full justify-center">
                {t("toDashboard")}
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle size={48} className="text-[var(--red)] mx-auto" />
              <h2 className="text-lg font-semibold">{t("errorTitle")}</h2>
              <p className="text-sm text-[var(--muted)]">{errorMessage || t("errorBody")}</p>
              <Link href="/settings" className="btn w-full justify-center">
                {t("toSettings")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
