"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Users,
  AlertCircle,
  Globe,
  Lock,
  Plus,
  CheckCircle2,
  Eye,
  User as UserIcon,
  Download,
} from "lucide-react";

interface SharedWL {
  _id: string;
  title: string;
  description?: string;
  tickerCount: number;
  tickers: string[];
  isPublic: boolean;
  isOwn: boolean;
  uploaderName?: string;
  uploaderEmail?: string;
  importCount: number;
  createdAt: string;
}

export default function CommunityWatchlistsPage() {
  const t = useTranslations("Watchlist.community_page");
  const [mine, setMine] = useState<SharedWL[]>([]);
  const [community, setCommunity] = useState<SharedWL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"community" | "mine">("community");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTickers, setNewTickers] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist/shared");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("errors.load"));
      setMine(Array.isArray(json.mine) ? json.mine : []);
      setCommunity(Array.isArray(json.community) ? json.community : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tickers = newTickers
        .split(/[,\s]+/)
        .map((t) => t.toUpperCase().trim())
        .filter(Boolean);
      if (tickers.length === 0) throw new Error(t("errors.minOneTicker"));
      const res = await fetch("/api/watchlist/shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          isPublic: newPublic,
          tickers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewTitle("");
      setNewDesc("");
      setNewTickers("");
      setNewPublic(true);
      setShowCreate(false);
      setMessage(t("listCreated"));
      setTab("mine");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function importList(id: string) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/watchlist/shared/${id}/import`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(
        t("importedMessage", { added: data.added, skipped: data.skipped })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    }
  }

  const visible = tab === "community" ? community : mine;

  return (
    <div className="space-y-6">
      <Link
        href="/watchlist"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users size={22} className="text-[var(--accent)]" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
          <Plus size={14} /> {t("publishNew")}
        </button>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {showCreate && (
        <form onSubmit={submit} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">{t("newList")}</h2>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={100}
            required
            className="input"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            maxLength={500}
            rows={2}
            className="input"
          />
          <input
            value={newTickers}
            onChange={(e) => setNewTickers(e.target.value)}
            placeholder={t("tickersPlaceholder")}
            required
            className="input"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={newPublic}
              onChange={(e) => setNewPublic(e.target.checked)}
            />
            <span>
              <Globe size={13} className="inline mr-1 text-[var(--accent)]" />
              {t("publicOption")}
            </span>
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="btn"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !newTitle.trim() || !newTickers.trim()}
              className="btn btn-primary"
            >
              {submitting ? <div className="spinner" /> : <Plus size={14} />}
              {t("publish")}
            </button>
          </div>
        </form>
      )}

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

      <div className="flex gap-2 border-b border-[var(--border)]">
        <TabButton active={tab === "community"} onClick={() => setTab("community")}>
          <Globe size={13} className="inline mr-1" /> {t("tabCommunity", { count: community.length })}
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          <Lock size={13} className="inline mr-1" /> {t("tabMine", { count: mine.length })}
        </TabButton>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {tab === "community" ? t("emptyCommunity") : t("emptyMine")}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((w) => (
            <div key={w._id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/watchlist/shared/${w._id}`}
                  className="font-semibold hover:text-[var(--accent)]"
                >
                  {w.title}
                </Link>
                {w.isPublic ? (
                  <Globe size={14} className="text-[var(--green)] flex-shrink-0 mt-1" />
                ) : (
                  <Lock size={14} className="text-[var(--muted)] flex-shrink-0 mt-1" />
                )}
              </div>
              {w.description && (
                <div className="text-xs text-[var(--muted)] line-clamp-2">
                  {w.description}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {w.tickers.map((tk) => (
                  <span
                    key={tk}
                    className="text-xs border border-[var(--border)] rounded px-2 py-0.5"
                  >
                    {tk}
                  </span>
                ))}
                {w.tickerCount > w.tickers.length && (
                  <span className="text-xs text-[var(--muted)]">
                    {t("moreCount", { count: w.tickerCount - w.tickers.length })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs text-[var(--muted)]">
                <div className="flex items-center gap-2">
                  {!w.isOwn && w.uploaderName && (
                    <>
                      <UserIcon size={11} />
                      {w.uploaderName}
                    </>
                  )}
                  {w.importCount > 0 && (
                    <span>
                      <Download size={11} className="inline mr-0.5" />
                      {t("importCount", { count: w.importCount })}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/watchlist/shared/${w._id}`}
                    className="hover:text-[var(--accent)] inline-flex items-center gap-1"
                  >
                    <Eye size={11} /> {t("details")}
                  </Link>
                  {!w.isOwn && (
                    <button
                      onClick={() => importList(w._id)}
                      className="hover:text-[var(--accent)] inline-flex items-center gap-1"
                      title={t("importTitle")}
                    >
                      <Download size={11} /> {t("import")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
        active
          ? "border-[var(--accent)] text-[var(--foreground)]"
          : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}
