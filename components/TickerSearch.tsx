"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

interface Props {
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TickerSearch({ onSelect, placeholder, autoFocus }: Props) {
  const t = useTranslations("Shared.tickerSearch");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || t("placeholder")}
          autoFocus={autoFocus}
          className="input pl-9"
        />
        {loading && <div className="spinner absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 card max-h-80 overflow-y-auto z-30 shadow-lg">
          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => {
                onSelect(r);
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-4 px-3 py-2 text-left hover:bg-[var(--surface-2)] border-b border-[var(--border)] last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.ticker}</div>
                <div className="text-xs text-[var(--muted)] truncate">{r.name}</div>
              </div>
              <div className="text-xs text-[var(--muted)] flex-shrink-0">
                {r.exchange} · {r.type}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
