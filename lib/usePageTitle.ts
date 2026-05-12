"use client";

import { useEffect } from "react";

/**
 * Setzt document.title für Client-Seiten (WCAG 2.4.2 Page Titled).
 * Server-Seiten sollten stattdessen `metadata.title` exportieren.
 * Der Base-Suffix „— AI Stock Analyzer" wird automatisch angehängt.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — AI Stock Analyzer` : "AI Stock Analyzer";
    return () => {
      document.title = previous;
    };
  }, [title]);
}
