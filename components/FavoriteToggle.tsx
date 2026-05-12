"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { findNavItemByHref } from "@/lib/navCatalog";

export const FAVORITES_CHANGED_EVENT = "ai-stock-analyzer:favorites-changed";

export interface FavoritesChangedDetail {
  favoriteSections: string[];
}

export function FavoriteToggle() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Favorites");
  const pathname = usePathname();
  const item = findNavItemByHref(pathname);
  const [favorites, setFavorites] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let aborted = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (aborted) return;
        const list = Array.isArray(d?.favoriteSections) ? d.favoriteSections : [];
        setFavorites(list);
      })
      .catch(() => {
        if (!aborted) setFavorites([]);
      });
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<FavoritesChangedDetail>;
      if (Array.isArray(ce.detail?.favoriteSections)) {
        setFavorites(ce.detail.favoriteSections);
      }
    }
    window.addEventListener(FAVORITES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onChange);
  }, []);

  if (!item) return null;
  if (item.href === "/") return null;
  if (favorites === null) return null;

  const isFavorite = favorites.includes(item.href);
  const label = tNav(item.labelKey);

  async function toggle() {
    if (!item || busy || favorites === null) return;
    const next = isFavorite
      ? favorites.filter((f) => f !== item.href)
      : [...favorites, item.href];
    setFavorites(next);
    setBusy(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteSections: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      window.dispatchEvent(
        new CustomEvent<FavoritesChangedDetail>(FAVORITES_CHANGED_EVENT, {
          detail: { favoriteSections: next },
        })
      );
    } catch {
      setFavorites(favorites);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isFavorite}
      title={isFavorite ? t("removeAria", { label }) : t("addAria", { label })}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
        isFavorite
          ? "border-yellow-400/40 text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20"
          : "border-[var(--border)] text-[var(--muted)] hover:text-yellow-400 hover:border-yellow-400/40"
      } ${busy ? "opacity-50 cursor-wait" : ""}`}
    >
      <Star
        size={12}
        aria-hidden="true"
        className={isFavorite ? "fill-yellow-400" : ""}
      />
      <span className="hidden sm:inline">
        {isFavorite ? t("isFavorite") : t("addToFavorites")}
      </span>
    </button>
  );
}
