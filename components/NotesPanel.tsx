"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  StickyNote,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
  AlertCircle,
} from "lucide-react";

interface Note {
  _id: string;
  ticker: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  ticker: string;
}

const MAX_BODY = 5000;

export function NotesPanel({ ticker }: Props) {
  const t = useTranslations("AnalysisPanels.notes");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pinDraft, setPinDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?ticker=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setNotes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, tCommon]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, body: text, pinned: pinDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setDraft("");
      setPinDraft(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(n: Note) {
    setError(null);
    try {
      const res = await fetch(`/api/notes/${n._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !n.pinned }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tCommon("error"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    }
  }

  function startEdit(n: Note) {
    setEditingId(n._id);
    setEditText(n.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(n: Note) {
    const text = editText.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${n._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tCommon("error"));
      }
      cancelEdit();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(n: Note) {
    if (!confirm(t("deleteConfirm"))) return;
    setError(null);
    try {
      const res = await fetch(`/api/notes/${n._id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || tCommon("error"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    }
  }

  return (
    <div className="card p-4 space-y-3" data-help="notes-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <StickyNote size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-semibold">{t("title")}</h2>
          {notes.length > 0 && (
            <span className="text-xs text-[var(--muted)] num">({notes.length})</span>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {t.rich("intro", {
          ticker,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {error && (
        <div role="alert" className="text-[var(--red)] text-sm flex items-center gap-2">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="space-y-2 border border-[var(--border)] rounded-lg p-3">
        <label htmlFor={`note-draft-${ticker}`} className="sr-only">
          {t("newAria", { ticker })}
        </label>
        <textarea
          id={`note-draft-${ticker}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          rows={3}
          maxLength={MAX_BODY}
          placeholder={t("placeholder", { ticker })}
          className="input font-sans w-full"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none text-[var(--muted)]">
            <input
              type="checkbox"
              checked={pinDraft}
              onChange={(e) => setPinDraft(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            {t("pin")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--muted)] num">
              {draft.length} / {MAX_BODY}
            </span>
            <button
              onClick={addNote}
              disabled={saving || draft.trim().length === 0}
              className="btn btn-primary text-sm"
            >
              {saving ? <div className="spinner" /> : <Plus size={13} aria-hidden="true" />}
              {t("add")}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">{t("loading")}</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-[var(--muted)] italic">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const isEditing = editingId === n._id;
            return (
              <li
                key={n._id}
                className={`border rounded-lg p-3 ${
                  n.pinned
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                    : "border-[var(--border)]"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value.slice(0, MAX_BODY))}
                      rows={4}
                      maxLength={MAX_BODY}
                      className="input font-sans w-full"
                      aria-label={t("editAria")}
                    />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] text-[var(--muted)] num">
                        {editText.length} / {MAX_BODY}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={cancelEdit} className="btn text-sm">
                          <X size={13} aria-hidden="true" />
                          {t("cancel")}
                        </button>
                        <button
                          onClick={() => saveEdit(n)}
                          disabled={saving || editText.trim().length === 0}
                          className="btn btn-primary text-sm"
                        >
                          {saving ? (
                            <div className="spinner" />
                          ) : (
                            <Save size={13} aria-hidden="true" />
                          )}
                          {t("save")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm whitespace-pre-wrap break-words flex-1">
                        {n.body}
                      </p>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => togglePin(n)}
                          className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)]"
                          title={n.pinned ? t("unpin") : t("pinAction")}
                          aria-label={n.pinned ? t("unpin") : t("pinAction")}
                        >
                          {n.pinned ? (
                            <PinOff size={14} aria-hidden="true" />
                          ) : (
                            <Pin size={14} aria-hidden="true" />
                          )}
                        </button>
                        <button
                          onClick={() => startEdit(n)}
                          className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)]"
                          title={t("edit")}
                          aria-label={t("editAria")}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => deleteNote(n)}
                          className="p-1.5 text-[var(--muted)] hover:text-[var(--red)]"
                          title={t("deleteTitle")}
                          aria-label={t("deleteAria")}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-2 flex items-center gap-2">
                      {n.pinned && (
                        <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                          <Pin size={10} aria-hidden="true" />
                          {t("pinned")}
                        </span>
                      )}
                      <span>
                        {new Date(n.createdAt).toLocaleString(dateLocale)}
                        {n.updatedAt && n.updatedAt !== n.createdAt && (
                          <>
                            {t("editedSuffix", { date: new Date(n.updatedAt).toLocaleString(dateLocale) })}
                          </>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
