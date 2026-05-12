"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Check } from "lucide-react";

interface Props {
  ticker: string;
  name?: string;
  size?: "sm" | "md";
}

export function WatchlistButton({ ticker, name, size = "md" }: Props) {
  const t = useTranslations("Shared.watchlist");
  const [inList, setInList] = useState<boolean | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((items: Array<{ _id: string; ticker: string }>) => {
        if (cancelled) return;
        const hit = items.find((i) => i.ticker.toUpperCase() === ticker.toUpperCase());
        setInList(!!hit);
        setId(hit?._id || null);
      })
      .catch(() => setInList(false));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  async function toggle() {
    if (inList === null) return;
    setLoading(true);
    try {
      if (inList && id) {
        await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
        setInList(false);
        setId(null);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, name }),
        });
        const data = await res.json();
        setInList(true);
        setId(data._id);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1500);
      }
    } finally {
      setLoading(false);
    }
  }

  if (inList === null) return null;

  const sizeClass = size === "sm" ? "text-xs px-2 py-1" : "";
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`btn ${sizeClass} ${inList ? "btn-primary" : ""}`}
      title={inList ? t("titleRemove") : t("titleAdd")}
    >
      {justAdded ? (
        <>
          <Check size={iconSize} /> {t("added")}
        </>
      ) : inList ? (
        <>
          <EyeOff size={iconSize} /> {t("onList")}
        </>
      ) : (
        <>
          <Eye size={iconSize} /> {t("add")}
        </>
      )}
    </button>
  );
}
