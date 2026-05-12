"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  BookOpen,
  Plus,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
} from "lucide-react";
import { fmtNumber } from "@/lib/format";
import { ageHighlightClass } from "@/lib/storage";

type ThesisStatus = "ACTIVE" | "ON_TRACK" | "AT_RISK" | "BROKEN" | "CLOSED";

interface Thesis {
  _id: string;
  ticker: string;
  thesis: string;
  exitCriteria?: string;
  expectedHorizonMonths?: number;
  priceAtEntry?: number;
  currency?: string;
  status: ThesisStatus;
  lastCheckStatus?: ThesisStatus;
  lastCheckVerdict?: string;
  lastCheckReasoning?: string;
  lastCheckSupporting?: string[];
  lastCheckContradicting?: string[];
  lastCheckRecommendation?: string;
  lastCheckAt?: string;
  createdAt: string;
}

const STATUS_COLOR: Record<ThesisStatus, string> = {
  ACTIVE: "text-[var(--muted)] border-[var(--border)]",
  ON_TRACK: "text-[var(--green)] border-[var(--green)]/40 bg-green-500/5",
  AT_RISK: "text-yellow-400 border-yellow-500/40 bg-yellow-500/5",
  BROKEN: "text-[var(--red)] border-[var(--red)]/40 bg-red-500/5",
  CLOSED: "text-[var(--muted)] border-[var(--border)] opacity-60",
};

export function ThesisPanel({
  ticker,
  currency,
  priceAtEntry,
}: {
  ticker?: string;
  currency?: string;
  priceAtEntry?: number;
}) {
  const t = useTranslations("AnalysisPanels.thesis");
  const tCommon = useTranslations("AnalysisPanels.common");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [list, setList] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTicker, setNewTicker] = useState(ticker || "");
  const [newThesis, setNewThesis] = useState("");
  const [newExit, setNewExit] = useState("");
  const [newHorizon, setNewHorizon] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = ticker
        ? `/api/thesis?ticker=${encodeURIComponent(ticker)}`
        : "/api/thesis";
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tCommon("error"));
      setList(Array.isArray(json) ? json : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [ticker, tCommon]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newTicker || ticker,
          thesis: newThesis,
          exitCriteria: newExit || undefined,
          expectedHorizonMonths: newHorizon === "" ? undefined : Number(newHorizon),
          priceAtEntry,
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      setNewThesis("");
      setNewExit("");
      setNewHorizon("");
      setShowAdd(false);
      setMessage(t("saved"));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function runCheck(id: string) {
    setCheckingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/thesis/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tCommon("error"));
      const statusLabel = t(`status.${data.status as ThesisStatus}` as Parameters<typeof t>[0]);
      setMessage(t("aiCheckDone", { status: statusLabel || data.status }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setCheckingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/thesis/${id}`, { method: "DELETE" });
    load();
  }

  async function close(id: string) {
    const reason = prompt(t("closePrompt"));
    if (reason == null) return;
    await fetch(`/api/thesis/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED", closedReason: reason }),
    });
    load();
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--accent)]" aria-hidden="true" />
          {ticker ? t("titleFor", { ticker }) : t("titleAll")}
        </h3>
        <button onClick={() => setShowAdd(!showAdd)} className="btn text-sm">
          <Plus size={13} aria-hidden="true" /> {t("newThesis")}
        </button>
      </div>

      <div className="text-xs text-[var(--muted)]">
        {t("intro")}
      </div>

      {showAdd && (
        <form onSubmit={submit} className="border border-[var(--border)] rounded p-3 space-y-2">
          {!ticker && (
            <input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder={t("fields.tickerPlaceholder")}
              required
              maxLength={20}
              className="input uppercase"
            />
          )}
          <textarea
            value={newThesis}
            onChange={(e) => setNewThesis(e.target.value)}
            placeholder={t("fields.thesisPlaceholder")}
            rows={3}
            maxLength={4000}
            required
            className="input"
          />
          <textarea
            value={newExit}
            onChange={(e) => setNewExit(e.target.value)}
            placeholder={t("fields.exitPlaceholder")}
            rows={2}
            maxLength={2000}
            className="input"
          />
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={newHorizon}
              onChange={(e) => setNewHorizon(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={t("fields.horizonPlaceholder")}
              className="input"
              min={1}
              max={600}
            />
            <button type="button" onClick={() => setShowAdd(false)} className="btn">
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !newThesis.trim()}
              className="btn btn-primary"
            >
              {submitting ? <div className="spinner" /> : <Plus size={13} aria-hidden="true" />}
              {t("save")}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="text-sm text-[var(--red)] flex items-center gap-2">
          <AlertTriangle size={14} aria-hidden="true" /> {error}
        </div>
      )}
      {message && (
        <div role="status" className="text-sm text-[var(--green)] flex items-center gap-2">
          <CheckCircle2 size={14} aria-hidden="true" /> {message}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-[var(--muted)]">{t("loading")}</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          {ticker ? t("emptyFor", { ticker }) : t("emptyAll")}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((th) => (
            <ThesisItem
              key={th._id}
              thesis={th}
              onCheck={() => runCheck(th._id)}
              onDelete={() => remove(th._id)}
              onClose={() => close(th._id)}
              checking={checkingId === th._id}
              showTicker={!ticker}
              dateLocale={dateLocale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThesisItem({
  thesis,
  onCheck,
  onDelete,
  onClose,
  checking,
  showTicker,
  dateLocale,
}: {
  thesis: Thesis;
  onCheck: () => void;
  onDelete: () => void;
  onClose: () => void;
  checking: boolean;
  showTicker: boolean;
  dateLocale: string;
}) {
  const t = useTranslations("AnalysisPanels.thesis");
  const locale = useLocale();
  const numLocale = locale === "de" ? "de-DE" : "en-US";
  const status = (thesis.lastCheckStatus || thesis.status) as ThesisStatus;
  const StatusIcon =
    status === "ON_TRACK"
      ? CheckCircle2
      : status === "AT_RISK"
        ? AlertTriangle
        : status === "BROKEN"
          ? XCircle
          : BookOpen;
  return (
    <div className={`border rounded p-3 space-y-2 ${STATUS_COLOR[status]}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {showTicker && (
            <a
              href={`/analysis/${encodeURIComponent(thesis.ticker)}`}
              className="font-semibold hover:text-[var(--accent)]"
            >
              {thesis.ticker}
            </a>
          )}
          <span className="text-xs inline-flex items-center gap-1">
            <StatusIcon size={12} aria-hidden="true" />{" "}
            {t(`status.${status}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onCheck}
            disabled={checking}
            className="btn text-xs"
            title={t("aiCheckTooltip")}
          >
            {checking ? <div className="spinner" /> : <Sparkles size={11} aria-hidden="true" />}
            {t("aiCheck")}
          </button>
          <button onClick={onClose} className="btn text-xs" title={t("closeTitle")}>
            <X size={11} aria-hidden="true" /> {t("closeBtn")}
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-[var(--muted)] hover:text-[var(--red)]"
            aria-label={t("deleteAria", { ticker: thesis.ticker })}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="text-[10px] text-[var(--muted)]">
        {t("createdAt", { date: new Date(thesis.createdAt).toLocaleDateString(dateLocale) })}
        {thesis.expectedHorizonMonths && (
          <>{t("horizonMonths", { months: thesis.expectedHorizonMonths })}</>
        )}
        {thesis.priceAtEntry && thesis.currency && (
          <>{t("entryPrice", { price: fmtNumber(thesis.priceAtEntry, numLocale, 2), currency: thesis.currency })}</>
        )}
      </div>
      <p className="text-sm">
        <strong className="text-[var(--muted)]">{t("thesisLabel")}</strong> {thesis.thesis}
      </p>
      {thesis.exitCriteria && (
        <p className="text-xs text-[var(--muted)]">
          <strong>{t("exitLabel")}</strong> {thesis.exitCriteria}
        </p>
      )}
      {thesis.lastCheckAt && thesis.lastCheckVerdict && (
        <div className="pt-2 border-t border-[var(--border)]/50 space-y-1">
          <div
            className={`text-[10px] ${
              ageHighlightClass(thesis.lastCheckAt) || "text-[var(--muted)]"
            }`}
          >
            {t("aiCheckedAt", { date: new Date(thesis.lastCheckAt).toLocaleString(dateLocale) })}
          </div>
          <p className="text-sm font-medium">{thesis.lastCheckVerdict}</p>
          {thesis.lastCheckReasoning && <p className="text-xs">{thesis.lastCheckReasoning}</p>}
          {thesis.lastCheckContradicting && thesis.lastCheckContradicting.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                {t("contradicts")}
              </div>
              <ul className="list-disc pl-5 text-xs">
                {thesis.lastCheckContradicting.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {thesis.lastCheckRecommendation && (
            <p className="text-xs">
              <strong>{t("recommended")}</strong> {thesis.lastCheckRecommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
