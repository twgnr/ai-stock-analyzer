"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Globe,
  Lock,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  User as UserIcon,
} from "lucide-react";

interface Item {
  ticker: string;
  name?: string;
  notes?: string;
}

interface Detail {
  _id: string;
  title: string;
  description?: string;
  tickers: Item[];
  isPublic: boolean;
  isOwn: boolean;
  uploaderName?: string;
  uploaderEmail?: string;
  importCount: number;
  createdAt: string;
}

export default function SharedWatchlistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("Watchlist.shared");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTickers, setEditTickers] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlist/shared/${id}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
      setEditTitle(json.title);
      setEditDesc(json.description || "");
      setEditTickers(json.tickers.map((t: Item) => t.ticker).join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function importAll() {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/watchlist/shared/${id}/import`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage(
        t("importedMessage", { added: json.added, skipped: json.skipped })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    }
  }

  async function toggleShare() {
    if (!data) return;
    try {
      const res = await fetch(`/api/watchlist/shared/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !data.isPublic }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData({ ...data, isPublic: json.isPublic });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    }
  }

  async function saveEdit() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const tickers = editTickers
        .split(/[,\s]+/)
        .map((t) => t.toUpperCase().trim())
        .filter(Boolean);
      const res = await fetch(`/api/watchlist/shared/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc,
          tickers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditing(false);
      setMessage(t("saved"));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/watchlist/shared/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error);
      }
      window.location.href = "/watchlist/community";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        <div className="spinner mb-2" />
        {t("loading")}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="card p-4 text-[var(--red)] flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/watchlist/community"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

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

      <div className="card p-5 space-y-4">
        {editing ? (
          <>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={100}
              className="input text-lg font-semibold"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              className="input"
            />
            <textarea
              value={editTickers}
              onChange={(e) => setEditTickers(e.target.value)}
              rows={3}
              placeholder={t("tickersPlaceholder")}
              className="input font-mono text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="btn">
                {t("cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? <div className="spinner" /> : <Save size={14} />}
                {t("save")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold">{data.title}</h1>
                  {data.isPublic ? (
                    <span className="text-xs inline-flex items-center gap-1 border border-[var(--green)]/30 text-[var(--green)] bg-green-500/10 rounded px-2 py-0.5">
                      <Globe size={11} /> {t("public")}
                    </span>
                  ) : (
                    <span className="text-xs inline-flex items-center gap-1 border border-[var(--border)] text-[var(--muted)] rounded px-2 py-0.5">
                      <Lock size={11} /> {t("private")}
                    </span>
                  )}
                </div>
                {data.uploaderName && !data.isOwn && (
                  <div className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                    <UserIcon size={11} /> {data.uploaderName}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {!data.isOwn && (
                  <button onClick={importAll} className="btn btn-primary">
                    <Download size={14} /> {t("importToWatchlist")}
                  </button>
                )}
                {data.isOwn && (
                  <>
                    <button onClick={() => setEditing(true)} className="btn">
                      <Edit3 size={14} /> {t("edit")}
                    </button>
                    <button onClick={toggleShare} className="btn">
                      {data.isPublic ? (
                        <>
                          <Lock size={14} /> {t("makePrivate")}
                        </>
                      ) : (
                        <>
                          <Globe size={14} /> {t("publish")}
                        </>
                      )}
                    </button>
                    <button onClick={remove} className="btn btn-danger">
                      <Trash2 size={14} /> {t("delete")}
                    </button>
                  </>
                )}
              </div>
            </div>

            {data.description && (
              <p className="text-sm text-[var(--muted)]">{data.description}</p>
            )}

            <div className="text-xs text-[var(--muted)] pt-3 border-t border-[var(--border)] flex flex-wrap gap-4">
              <span>{t("tickerCount", { count: data.tickers.length })}</span>
              <span>{t("importedCount", { count: data.importCount })}</span>
              <span>
                {t("createdOn", {
                  date: new Date(data.createdAt).toLocaleDateString(dateLocale),
                })}
              </span>
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-3 py-3">{t("columns.ticker")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.name")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.note")}</th>
              </tr>
            </thead>
            <tbody>
              {data.tickers.map((tk) => (
                <tr
                  key={tk.ticker}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/analysis/${encodeURIComponent(tk.ticker)}`}
                      className="font-medium hover:text-[var(--accent)]"
                    >
                      {tk.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">
                    {tk.name || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">
                    {tk.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
