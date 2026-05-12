"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale, useFormatter } from "next-intl";
import {
  Newspaper,
  Sparkles,
  AlertCircle,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

interface DigestItem {
  _id: string;
  headline: string;
  summary: string;
  periodDays: number;
  tickerCount: number;
  model?: string;
  createdAt: string;
}

export default function NewsDigestListPage() {
  const t = useTranslations("NewsDigest.list");
  const tCommon = useTranslations("NewsDigest.common");
  const locale = useLocale();
  const format = useFormatter();
  const [items, setItems] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(7);
  const [includeWatchlist, setIncludeWatchlist] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news-digest");
      if (res.status === 401) {
        window.location.href = `/${locale}/login`;
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [locale, tCommon]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/news-digest/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodDays, includeWatchlist, sendEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(t("createdSuccess"));
      window.location.href = `/${locale}/news-digest/${json._id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Newspaper size={22} className="text-[var(--accent)]" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">{t("intro")}</div>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">{t("createTitle")}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("period")}
            </label>
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="input"
              disabled={generating}
            >
              <option value={3}>{t("period3d")}</option>
              <option value={7}>{t("period7d")}</option>
              <option value={14}>{t("period14d")}</option>
              <option value={30}>{t("period30d")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none sm:mt-6">
            <input
              type="checkbox"
              checked={includeWatchlist}
              onChange={(e) => setIncludeWatchlist(e.target.checked)}
              disabled={generating}
            />
            {t("includeWatchlist")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none sm:mt-6">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={generating}
            />
            <Mail size={13} />
            {t("sendEmail")}
          </label>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="btn btn-primary"
        >
          {generating ? <div className="spinner" /> : <Sparkles size={14} />}
          {generating ? t("creating") : t("create")}
        </button>
        {generating && (
          <div className="text-xs text-[var(--muted)]">{t("creatingHint")}</div>
        )}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div role="status" className="card p-3 text-[var(--green)] flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {tCommon("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {t("emptyList")}
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
            {t("history")}
          </h2>
          {items.map((d) => (
            <Link
              key={d._id}
              href={`/news-digest/${d._id}`}
              className="card card-hover p-4 block"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{d.headline}</div>
                  {d.summary && (
                    <div className="text-sm text-[var(--muted)] line-clamp-2 mt-1">
                      {d.summary}
                    </div>
                  )}
                </div>
                <div className="text-xs text-[var(--muted)] text-right whitespace-nowrap">
                  <div>
                    {format.dateTime(new Date(d.createdAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                  <div>
                    {d.periodDays}T • {t("tickerHighlights", { count: d.tickerCount })}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
