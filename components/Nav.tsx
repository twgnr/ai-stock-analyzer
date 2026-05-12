"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpToggle } from "@/components/HelpToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  LineChart,
  Settings,
  LogOut,
  User as UserIcon,
  Shield,
  MailWarning,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  NAV_ITEMS as items,
  NAV_GROUP_ORDER as GROUP_ORDER,
  type NavItem,
} from "@/lib/navCatalog";

const SHOWFROM_CLASSES: Record<"always" | "sm" | "md" | "lg", string> = {
  always: "inline-flex",
  sm: "hidden sm:inline-flex",
  md: "hidden md:inline-flex",
  lg: "hidden lg:inline-flex",
};

/**
 * Map href → Hilfe-Schlüssel. Nicht alle Routen haben den simplen Pattern
 * `nav:<lastSegment>`; einige Sub-Routen werden auf den Top-Level-Schlüssel
 * gemappt (z. B. /portfolio/risk → nav:risk).
 */
function helpKeyForHref(href: string): string {
  const stripped = href.replace(/^\//, "");
  if (!stripped) return "nav:dashboard";
  // Mehrere Segmente: nimm das letzte, das es im HELP_TEXTS gibt — sonst das
  // letzte überhaupt.
  const segments = stripped.split("/");
  const last = segments[segments.length - 1] || segments[0];
  return `nav:${last}`;
}

/** Inverse zu SHOWFROM_CLASSES: zeigt das Item nur, solange es im Header
 *  versteckt ist — wird im „Mehr"-Dropdown verwendet. */
const DROPDOWN_ONLY_CLASSES: Record<"always" | "sm" | "md" | "lg", string> = {
  always: "hidden",
  sm: "block sm:hidden",
  md: "block md:hidden",
  lg: "block lg:hidden",
};

interface Me {
  email: string;
  name?: string;
  hasClaudeKey: boolean;
  role: "user" | "admin";
  emailVerified: boolean;
}

export function Nav() {
  const t = useTranslations("Nav");
  const tVerify = useTranslations("Verify");
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const primaryItems = items.filter((i) => i.showFrom);
  const dropdownItems = items.filter((i) => !i.showFrom);
  // Aktiv-Highlight im „Mehr"-Button, wenn die aktuelle Route in dessen
  // Dropdown-Items ist (aber nicht zu den immer sichtbaren Primary gehört).
  const activeInDropdown = dropdownItems.some(
    (i) => pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href))
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {});
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function resendVerify() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResendMsg(tVerify("resent"));
    } catch (e) {
      setResendMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setResending(false);
      setTimeout(() => setResendMsg(null), 5000);
    }
  }

  const initial = (me?.name || me?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      {me && !me.emailVerified && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <MailWarning size={14} />
              <span
                dangerouslySetInnerHTML={{
                  __html: tVerify("banner", { email: me.email }),
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              {resendMsg && <span className="text-xs">{resendMsg}</span>}
              <button
                onClick={resendVerify}
                disabled={resending}
                className="text-xs underline hover:text-white"
              >
                {resending ? tVerify("sending") : tVerify("resend")}
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3 min-h-14 py-2">
          <Link href="/" className="flex items-center gap-2 font-semibold flex-shrink-0">
            <LineChart size={20} className="text-[var(--accent)]" />
            <span className="hidden sm:inline">AI Stock Analyzer</span>
          </Link>
          <div className="flex items-center gap-x-0.5 flex-1 min-w-0">
            {primaryItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              const cls = SHOWFROM_CLASSES[item.showFrom!];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-help={helpKeyForHref(item.href)}
                  className={`${cls} items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                    active
                      ? "bg-[var(--surface-2)] text-white"
                      : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Icon size={15} />
                  {t(item.labelKey)}
                </Link>
              );
            })}

            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                  activeInDropdown || moreOpen
                    ? "bg-[var(--surface-2)] text-white"
                    : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
                }`}
              >
                <MoreHorizontal size={15} />
                {t("more")}
                <ChevronDown
                  size={12}
                  className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
                />
              </button>
              {moreOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMoreOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute left-0 top-full mt-1 w-64 card z-40 overflow-y-auto shadow-lg py-1 max-h-[80vh]">
                    {/* Bei schmalen Screens, auf denen einige Primary-Items im
                        Header noch unsichtbar sind, werden sie hier zusätzlich
                        angeboten. Jedes Item bekommt die inverse
                        Sichtbarkeitsklasse zu seinem Header-Slot. */}
                    {primaryItems.some((i) => i.showFrom !== "always") && (
                      <div className="lg:hidden">
                        {primaryItems
                          .filter((i) => i.showFrom !== "always")
                          .map((item) => (
                            <div
                              key={`mobile-${item.href}`}
                              className={DROPDOWN_ONLY_CLASSES[item.showFrom!]}
                            >
                              <DropdownLink
                                item={item}
                                pathname={pathname}
                                onClick={() => setMoreOpen(false)}
                              />
                            </div>
                          ))}
                        <div className="border-t border-[var(--border)] my-1 last:hidden" />
                      </div>
                    )}
                    {GROUP_ORDER.map((group, idx) => {
                      const groupItems = dropdownItems.filter((i) => i.groupKey === group);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={group}>
                          {idx > 0 && (
                            <div className="border-t border-[var(--border)] my-1" />
                          )}
                          <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider px-3 pt-2 pb-1">
                            {t(group)}
                          </div>
                          {groupItems.map((item) => (
                            <DropdownLink
                              key={item.href}
                              item={item}
                              pathname={pathname}
                              onClick={() => setMoreOpen(false)}
                            />
                          ))}
                        </div>
                      );
                    })}
                    {/* Items ohne Gruppe (Fallback) */}
                    {dropdownItems.filter((i) => !i.groupKey).length > 0 && (
                      <>
                        <div className="border-t border-[var(--border)] my-1" />
                        {dropdownItems
                          .filter((i) => !i.groupKey)
                          .map((item) => (
                            <DropdownLink
                              key={item.href}
                              item={item}
                              pathname={pathname}
                              onClick={() => setMoreOpen(false)}
                            />
                          ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {me?.role === "admin" && (
              <Link
                href="/admin"
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                  pathname.startsWith("/admin")
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "text-yellow-400/70 hover:text-yellow-400 hover:bg-yellow-500/10"
                }`}
              >
                <Shield size={15} /> {t("admin")}
              </Link>
            )}
          </div>
          <LanguageSwitcher variant="compact" />
          {me && <HelpToggle />}
          {me && <NotificationBell />}
          {me && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--surface-2)]"
              >
                <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-semibold text-xs">
                  {initial}
                </div>
                <span className="hidden lg:inline text-[var(--muted)]">
                  {me.name || me.email.split("@")[0]}
                </span>
              </button>
              {open && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 top-full mt-1 w-56 card z-40 overflow-hidden shadow-lg">
                    <div className="px-3 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <UserIcon size={12} />
                        {me.email}
                      </div>
                      {me.role === "admin" && (
                        <div className="text-yellow-400 mt-1">{t("admin")}</div>
                      )}
                      {!me.hasClaudeKey && (
                        <div className="text-yellow-400 mt-1">{t("noAiKey")}</div>
                      )}
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setOpen(false)}
                      data-help="nav:settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                    >
                      <Settings size={14} /> {t("settings")}
                    </Link>
                    {me.role === "admin" && (
                      <Link
                        href="/admin"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-2)] text-yellow-400"
                      >
                        <Shield size={14} /> {t("admin")}
                      </Link>
                    )}
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-2)] text-left border-t border-[var(--border)]"
                    >
                      <LogOut size={14} /> {t("logout")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

function DropdownLink({
  item,
  pathname,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  onClick: () => void;
}) {
  const t = useTranslations("Nav");
  const active =
    pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      data-help={helpKeyForHref(item.href)}
      className={`flex items-center gap-2 px-3 py-2 text-sm ${
        active
          ? "bg-[var(--surface-2)] text-white"
          : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
      }`}
    >
      <Icon size={14} />
      {t(item.labelKey)}
    </Link>
  );
}
