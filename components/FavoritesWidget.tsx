"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Star, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { findNavItemByHref } from "@/lib/navCatalog";
import {
  FAVORITES_CHANGED_EVENT,
  type FavoritesChangedDetail,
} from "@/components/FavoriteToggle";

interface Props {
  initialFavorites: string[];
  onChange?: (next: string[]) => void;
}

export function FavoritesWidget({ initialFavorites, onChange }: Props) {
  const tNav = useTranslations("Nav");
  const tWidget = useTranslations("Favorites");
  const [favorites, setFavorites] = useState<string[]>(initialFavorites);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setFavorites(initialFavorites);
  }, [initialFavorites]);

  useEffect(() => {
    function onExternalChange(e: Event) {
      const ce = e as CustomEvent<FavoritesChangedDetail>;
      if (Array.isArray(ce.detail?.favoriteSections)) {
        setFavorites(ce.detail.favoriteSections);
      }
    }
    window.addEventListener(FAVORITES_CHANGED_EVENT, onExternalChange);
    return () =>
      window.removeEventListener(FAVORITES_CHANGED_EVENT, onExternalChange);
  }, []);

  async function remove(href: string) {
    if (busy) return;
    const next = favorites.filter((h) => h !== href);
    setFavorites(next);
    setBusy(href);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteSections: next }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(
        new CustomEvent<FavoritesChangedDetail>(FAVORITES_CHANGED_EVENT, {
          detail: { favoriteSections: next },
        })
      );
      onChange?.(next);
    } catch {
      setFavorites(favorites);
    } finally {
      setBusy(null);
    }
  }

  const items = favorites
    .map((h) => findNavItemByHref(h))
    .filter((i): i is NonNullable<ReturnType<typeof findNavItemByHref>> => !!i);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-yellow-400 fill-yellow-400" />
          <h2 className="font-semibold">{tWidget("title")}</h2>
          {items.length > 0 && (
            <span className="text-xs text-[var(--muted)]">({items.length})</span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">{tWidget("empty")}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const removing = busy === item.href;
            const label = tNav(item.labelKey);
            return (
              <div key={item.href} className="relative group">
                <Link
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-2)] transition-colors text-sm"
                >
                  <Icon size={15} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(item.href);
                  }}
                  disabled={removing}
                  aria-label={tWidget("removeAria", { label })}
                  title={tWidget("remove")}
                  className="absolute top-1 right-1 p-1 rounded text-[var(--muted)] hover:text-[var(--red)] hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
