"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * Schmale Top-Progress-Bar bei Routenwechsel. Beim Klick auf einen internen
 * Link (delegated über `document`) füllt sie sich asymptotisch bis ~85 %, beim
 * Pathname-Wechsel springt sie auf 100 % und blendet aus.
 *
 * Bewusst keine Lib-Abhängigkeit — verhält sich nahe an NProgress.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<number | null>(null);
  const fadeRef = useRef<number | null>(null);
  const lastPathRef = useRef(pathname);

  function clearTimers() {
    if (tickRef.current != null) {
      window.clearTimeout(tickRef.current);
      tickRef.current = null;
    }
    if (fadeRef.current != null) {
      window.clearTimeout(fadeRef.current);
      fadeRef.current = null;
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Modifier-Klicks (Cmd/Ctrl/Shift) öffnen neue Tabs — keine Navigation hier.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      const link = (e.target as HTMLElement | null)?.closest("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)) {
        return; // externer absoluter Link
      }
      if (link.target && link.target !== "" && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      // Same-Path? Kein progress.
      try {
        const url = new URL(href, window.location.origin);
        if (
          url.origin === window.location.origin &&
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }

      clearTimers();
      setVisible(true);
      setProgress(15);
      let p = 15;
      const advance = () => {
        // asymptotisch bis 85 %
        p = Math.min(85, p + Math.max(1, (85 - p) * 0.18));
        setProgress(p);
        tickRef.current = window.setTimeout(advance, 220);
      };
      tickRef.current = window.setTimeout(advance, 220);
    }
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    if (!visible && progress === 0) return;
    clearTimers();
    // Pathname ist hier eine externe Quelle (Browser-History) — Synchronisation
    // mit unserem Animations-State ist legitim und nicht das Anti-Pattern,
    // das der Hook-Linter eigentlich abfängt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(100);
    fadeRef.current = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
    return () => clearTimers();
  }, [pathname, progress, visible]);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[200] h-0.5 pointer-events-none"
    >
      <div
        className="h-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transition:
            progress >= 100
              ? "opacity 280ms ease-out"
              : "width 220ms ease-out, opacity 200ms ease-in",
        }}
      />
    </div>
  );
}
