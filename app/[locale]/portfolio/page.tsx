"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RefreshCw, FileText, Download, GitBranch, BarChart3 } from "lucide-react";
import { AddPositionForm } from "@/components/AddPositionForm";
import { PortfolioTable, type EnrichedPosition } from "@/components/PortfolioTable";
import { EditPositionDialog } from "@/components/EditPositionDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonTable } from "@/components/Skeleton";
import { enrichPortfolio } from "@/lib/enrichPortfolio";
import { isWithinExtendedTradingWindow } from "@/lib/tradingHours";
import { toast } from "@/lib/toast";

const AUTO_REFRESH_MS = 60 * 1000;

interface RawPosition {
  _id: string;
  ticker: string;
  name?: string;
  shares: number;
  avgPrice: number;
  currency: string;
}

export default function PortfolioPage() {
  const t = useTranslations("Portfolio");
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      const rRes = await fetch("/api/portfolio");
      if (rRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const raw = await rRes.json();
      if (!Array.isArray(raw)) {
        setPositions([]);
        return;
      }
      if (raw.length === 0) {
        setPositions([]);
        return;
      }
      const tickers = raw.map((p) => p.ticker).join(",");
      const qRes = await fetch(`/api/stocks/quote?tickers=${encodeURIComponent(tickers)}`);
      const quotes = await qRes.json();
      const currencies = [
        ...new Set<string>(
          quotes.map((q: { currency: string }) => q.currency).concat(raw.map((p) => p.currency))
        ),
      ];
      const fxRes = await fetch(`/api/fx?currencies=${encodeURIComponent(currencies.join(","))}`);
      const fxData = (await fxRes.json()) as { base: string; rates: Record<string, number> };
      setPositions(enrichPortfolio(raw, quotes, fxData.rates || {}, fxData.base || "EUR"));
      // Sparklines parallel im Hintergrund — nicht blockierend.
      const tickerList = raw.map((p) => p.ticker);
      fetch("/api/stocks/sparklines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickerList }),
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((map: Record<string, number[]>) => {
          if (map && typeof map === "object") setSparklines(map);
        })
        .catch(() => {});
    } finally {
      if (!silent) setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    }, AUTO_REFRESH_MS);
    // Wenn der User nach Stunden zurück auf den Tab kommt, sofort frische
    // Kurse holen statt bis zum nächsten Intervall-Tick zu warten.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!isWithinExtendedTradingWindow()) return;
      load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function confirmDelete() {
    if (!deleteId) return;
    const target = positions.find((p) => p._id === deleteId);
    if (!target) {
      setDeleteId(null);
      return;
    }
    // Optimistisch: Position sofort aus der UI entfernen, Snapshot für
    // potentiellen Rollback merken. Dialog gleich schließen — der Klick fühlt
    // sich dadurch instant an.
    const snapshot = positions;
    setPositions((prev) => prev.filter((p) => p._id !== deleteId));
    setDeleteId(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/portfolio/${target._id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("deleteError"));
      }
      toast.success(t("deletedToast", { ticker: target.ticker }));
    } catch (e) {
      // Rollback: ursprünglichen Zustand wiederherstellen.
      setPositions(snapshot);
      toast.error(e instanceof Error ? e.message : t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  const editingPosition = editingId
    ? positions.find((p) => p._id === editingId) ?? null
    : null;
  const deletingPosition = deleteId
    ? positions.find((p) => p._id === deleteId) ?? null
    : null;
  const editDialogPosition = editingPosition
    ? {
        _id: editingPosition._id,
        ticker: editingPosition.ticker,
        name: editingPosition.name,
        shares: editingPosition.shares,
        avgPrice: editingPosition.avgPrice,
        currency: editingPosition.purchaseCurrency,
        notes: undefined,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/portfolio/metrics" className="btn">
            <BarChart3 size={14} /> {t("navButtons.metrics")}
          </Link>
          <Link href="/portfolio/correlations" className="btn">
            <GitBranch size={14} /> {t("navButtons.correlations")}
          </Link>
          <Link href="/portfolio/import" className="btn">
            <Download size={14} /> {t("navButtons.import")}
          </Link>
          <Link href="/portfolio/report" className="btn">
            <FileText size={14} /> {t("navButtons.report")}
          </Link>
          <button onClick={() => load()} disabled={refreshing} className="btn">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("newPosition")}
          </h2>
          <AddPositionForm onAdded={load} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("currentPositions", { count: positions.length })}
          </h2>
          {loading ? (
            <SkeletonTable rows={6} cols={6} />
          ) : (
            <PortfolioTable
              positions={positions}
              showActions
              onEdit={setEditingId}
              onDelete={setDeleteId}
              sparklines={sparklines}
            />
          )}
        </div>
      </div>

      <EditPositionDialog
        position={editDialogPosition}
        onClose={() => setEditingId(null)}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteConfirmTitle")}
        tone="danger"
        confirmLabel={deleting ? t("deleting") : t("delete")}
        busy={deleting}
        message={
          deletingPosition ? (
            <>
              <strong className="text-[var(--foreground)]">
                {deletingPosition.ticker}
              </strong>{" "}
              ({deletingPosition.name}) {t("deleteMessageWithName")}
            </>
          ) : (
            t("deleteMessage")
          )
        }
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeleteId(null);
        }}
      />
    </div>
  );
}
