"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Save, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";

interface Position {
  _id: string;
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currency: string;
  notes?: string;
}

interface Props {
  position: Position | null;
  onClose: () => void;
  onSaved: () => void;
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "HKD", "SGD", "SEK", "NOK", "DKK"];

export function EditPositionDialog({ position, onClose, onSaved }: Props) {
  const t = useTranslations("AddPosition.edit");
  const tErr = useTranslations("AddPosition.edit.errors");
  const [shares, setShares] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (position) {
      setShares(String(position.shares));
      setAvgPrice(String(position.avgPrice));
      setCurrency(position.currency);
      setNotes(position.notes || "");
      setError(null);
    }
  }, [position]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (position) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [position, onClose]);

  if (!position) return null;

  async function save() {
    if (!position) return;
    const s = parseFloat(shares.replace(",", "."));
    const p = parseFloat(avgPrice.replace(",", "."));
    if (!(s > 0) || !(p > 0)) {
      setError(tErr("valuesPositive"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/${position._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares: s, avgPrice: p, currency, notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tErr("saveFailed"));
      }
      toast.success(t("successUpdated", { ticker: position.ticker }));
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr("generic");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card p-5 w-full max-w-md mt-12 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-lg">{t("title")}</h2>
            <p className="text-sm text-[var(--muted)]">
              {position.ticker} · {position.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--muted)] hover:text-white"
            title={t("closeTitle")}
            aria-label={t("closeAria")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("sharesLabel")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("avgPriceLabel")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("currencyLabel")}
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("noteLabel")}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notePlaceholder")}
            className="input"
          />
        </div>

        {error && (
          <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button onClick={onClose} className="btn">
            {t("cancel")}
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? <div className="spinner" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
