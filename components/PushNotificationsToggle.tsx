"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BellRing, BellOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";

type Status =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "server-disabled" }
  | { kind: "denied" }
  | { kind: "subscribed"; endpoint: string }
  | { kind: "unsubscribed" };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Module-Level-Cache für den VAPID-Public-Key. Der ändert sich nie zur
 * Laufzeit, also reicht ein einziger Fetch pro Browser-Session — egal wie oft
 * der Component (re)mountet (z. B. Tab-Wechsel, StrictMode-Doppel-Run, …).
 */
let keyPromise: Promise<string | null> | null = null;
function fetchPublicKey(): Promise<string | null> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    try {
      const res = await fetch("/api/notifications/push/key", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data.publicKey === "string" ? data.publicKey : null;
    } catch {
      return null;
    }
  })();
  return keyPromise;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ?? null;
}

export function PushNotificationsToggle() {
  const t = useTranslations("Settings.push");
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  // Guard gegen doppelte init-Runs (StrictMode-Mount/Unmount/Mount).
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled)
          setStatus({
            kind: "unsupported",
            reason: t("unsupported"),
          });
        return;
      }

      const key = await fetchPublicKey();
      if (cancelled) return;
      if (!key) {
        setStatus({ kind: "server-disabled" });
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setStatus({ kind: "denied" });
        return;
      }

      const reg = await getRegistration();
      if (cancelled) return;
      if (!reg) {
        setStatus({ kind: "unsubscribed" });
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) {
        if (sub) setStatus({ kind: "subscribed", endpoint: sub.endpoint });
        else setStatus({ kind: "unsubscribed" });
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function subscribe() {
    setBusy(true);
    try {
      const key = await fetchPublicKey();
      if (!key) throw new Error(t("vapidUnavailable"));
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (permission === "denied") setStatus({ kind: "denied" });
        toast.error(t("permissionDenied"));
        return;
      }
      const reg = await getRegistration();
      if (!reg) throw new Error(t("swUnregistered"));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // pushManager.subscribe verlangt BufferSource — Uint8Array passt zur
        // Laufzeit, das TS-DOM-Typing ist hier zu eng.
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error(t("subscriptionIncomplete"));
      }
      const res = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        // Lokale Subscription wieder zurückrollen, damit kein Zombie bleibt.
        await sub.unsubscribe().catch(() => {});
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("subscriptionRejected"));
      }
      setStatus({ kind: "subscribed", endpoint: json.endpoint });
      toast.success(t("subscribed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("enableError"));
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/notifications/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setStatus({ kind: "unsubscribed" });
      toast.success(t("unsubscribed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("disableError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5">
        <BellRing size={13} className="text-[var(--muted)]" aria-hidden="true" />
        {t("title")}
      </div>
      <p className="text-xs text-[var(--muted)]">{t("body")}</p>

      {status.kind === "loading" && (
        <div className="text-xs text-[var(--muted)] inline-flex items-center gap-2">
          <span className="spinner" /> {t("loading")}
        </div>
      )}
      {status.kind === "unsupported" && (
        <div className="text-xs text-[var(--muted)] flex items-start gap-1.5">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{status.reason}</span>
        </div>
      )}
      {status.kind === "server-disabled" && (
        <div className="text-xs text-[var(--muted)] flex items-start gap-1.5">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{t("serverDisabled")}</span>
        </div>
      )}
      {status.kind === "denied" && (
        <div className="text-xs text-yellow-400 flex items-start gap-1.5">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{t("denied")}</span>
        </div>
      )}
      {status.kind === "subscribed" && (
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs text-[var(--green)]">
            <CheckCircle2 size={12} aria-hidden="true" />
            {t("active")}
          </div>
          <button
            onClick={unsubscribe}
            disabled={busy}
            className="btn text-sm"
          >
            {busy ? <div className="spinner" /> : <BellOff size={13} aria-hidden="true" />}
            {t("disable")}
          </button>
        </div>
      )}
      {status.kind === "unsubscribed" && (
        <button
          onClick={subscribe}
          disabled={busy}
          className="btn btn-primary text-sm"
        >
          {busy ? <div className="spinner" /> : <BellRing size={13} aria-hidden="true" />}
          {t("enable")}
        </button>
      )}
    </div>
  );
}
