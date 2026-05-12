"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bell, Bell as BellRing, Sparkles, AlertCircle } from "lucide-react";

interface NotificationItem {
  id: string;
  type: "alert" | "analysis";
  title: string;
  subtitle: string;
  href: string;
  at: number;
}

const SEEN_KEY = "ai-stock-analyzer:notifications:lastSeenAt:v1";
const POLL_MS = 60 * 1000;

function readLastSeen(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(SEEN_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(ts: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, String(ts));
  } catch {}
}

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const fetchedRef = useRef(false);

  function relativeTime(ts: number): string {
    const diffSec = Math.max(0, Math.round((now - ts) / 1000));
    if (diffSec < 60) return t("relative.seconds", { value: diffSec });
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return t("relative.minutes", { value: diffMin });
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return t("relative.hours", { value: diffH });
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return t("relative.days", { value: diffD });
    return new Date(ts).toLocaleDateString(
      locale === "de" ? "de-DE" : "en-US",
      { day: "2-digit", month: "2-digit" }
    );
  }

  useEffect(() => {
    // localStorage ist eine externe Quelle (Browser), nicht abrufbar während
    // SSR. Wir lesen einmal nach Mount — das ist das vom Linter gemeinte
    // „Subscribe for updates from external system", auch wenn ohne Listener.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSeen(readLastSeen());
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.items)) setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }

  // Initial-Load und periodisches Polling.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Tick für relative Zeit-Labels — nur wenn offen, um Re-Renders zu sparen.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const unreadCount = items.filter((it) => it.at > lastSeen).length;

  function toggleOpen() {
    setOpen((o) => {
      if (!o) {
        // Beim Öffnen: alles als gelesen markieren.
        const newest = items[0]?.at;
        if (newest && newest > lastSeen) {
          writeLastSeen(newest);
          setLastSeen(newest);
        }
      }
      return !o;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative p-2 rounded-md text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
        aria-label={
          unreadCount > 0
            ? t("unreadAria", { count: unreadCount })
            : t("title")
        }
        aria-expanded={open}
      >
        {unreadCount > 0 ? (
          <BellRing size={18} className="text-[var(--accent)]" />
        ) : (
          <Bell size={18} />
        )}
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--red)] text-white text-[10px] font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] card z-40 overflow-hidden shadow-lg">
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-sm font-semibold">{t("title")}</span>
              <Link
                href="/alerts/history"
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                {t("allAlerts")}
              </Link>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {loading && items.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  <span className="spinner" />
                </div>
              )}
              {error && (
                <div className="px-3 py-3 text-xs text-[var(--red)] flex items-start gap-2">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {!loading && items.length === 0 && !error && (
                <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                  <Bell size={20} className="mx-auto mb-2 opacity-40" />
                  {t("empty")}
                </div>
              )}
              {items.map((it) => {
                const isUnread = it.at > lastSeen;
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] ${
                      isUnread ? "bg-[var(--accent)]/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {it.type === "alert" ? (
                          <BellRing
                            size={14}
                            className={
                              isUnread ? "text-[var(--accent)]" : "text-[var(--muted)]"
                            }
                          />
                        ) : (
                          <Sparkles
                            size={14}
                            className={
                              isUnread ? "text-[var(--accent)]" : "text-[var(--muted)]"
                            }
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-medium truncate">{it.title}</div>
                          <div className="text-[10px] text-[var(--muted)] flex-shrink-0 num">
                            {relativeTime(it.at)}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--muted)] line-clamp-2">
                          {it.subtitle}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
