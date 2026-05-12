"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TickerSearch } from "./TickerSearch";
import { Plus, Info } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  onAdded: () => void;
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "HKD", "SGD", "SEK", "NOK", "DKK"];

export function AddPositionForm({ onAdded }: Props) {
  const t = useTranslations("AddPosition.form");
  const tErr = useTranslations("AddPosition.form.errors");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] = useState("EUR");
  const [tradingCurrency, setTradingCurrency] = useState("");
  const [exchange, setExchange] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPickTicker(tick: string, n: string) {
    setTicker(tick);
    setName(n);
    setTradingCurrency("");
    setExchange("");
    setDetecting(true);
    try {
      const res = await fetch(`/api/stocks/quote?tickers=${encodeURIComponent(tick)}`);
      const quotes = await res.json();
      if (Array.isArray(quotes) && quotes.length > 0) {
        setTradingCurrency(quotes[0].currency || "");
        setExchange(quotes[0].exchange || "");
      }
    } catch {
      // ignore
    } finally {
      setDetecting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker) {
      setError(tErr("tickerRequired"));
      return;
    }
    const s = parseFloat(shares.replace(",", "."));
    const p = parseFloat(avgPrice.replace(",", "."));
    if (!(s > 0) || !(p > 0)) {
      setError(tErr("valuesPositive"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          name,
          shares: s,
          avgPrice: p,
          currency: purchaseCurrency,
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tErr("saveFailed"));
      }
      const savedTicker = ticker;
      setTicker("");
      setName("");
      setShares("");
      setAvgPrice("");
      setTradingCurrency("");
      setExchange("");
      setNotes("");
      toast.success(t("successAdded", { ticker: savedTicker }));
      onAdded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr("generic");
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const currenciesDiffer =
    tradingCurrency && purchaseCurrency !== tradingCurrency.toUpperCase();

  return (
    <form onSubmit={submit} className="card p-4 space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
          {t("stockSearchLabel")}
        </label>
        <TickerSearch
          onSelect={(r) => onPickTicker(r.ticker, r.name)}
          placeholder={t("tickerPlaceholder")}
        />
        {ticker && (
          <div className="mt-2 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-semibold">{ticker}</span>
            <span className="text-[var(--muted)]">{name}</span>
            {detecting && <div className="spinner" />}
            {!detecting && tradingCurrency && (
              <span className="text-xs px-2 py-0.5 bg-[var(--surface-2)] border border-[var(--border)] rounded">
                {t("tradingIn", { currency: tradingCurrency })}
                {exchange && ` · ${exchange}`}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("sharesLabel")}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="10"
            className="input"
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
            placeholder="125.50"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {t("purchaseCurrencyLabel")}
          </label>
          <select
            value={purchaseCurrency}
            onChange={(e) => setPurchaseCurrency(e.target.value)}
            className="input"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {ticker && tradingCurrency && (
        <div className="text-xs text-[var(--muted)] flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2">
          <Info size={14} className="flex-shrink-0 mt-0.5 text-[var(--accent)]" />
          <span>
            <strong>{t("purchaseCurrencyInfoBold")}</strong>{" "}
            {t("purchaseCurrencyInfo", { currency: tradingCurrency })}
            {currenciesDiffer && <> {t("fxNote")}</>}
          </span>
        </div>
      )}
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
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <button type="submit" disabled={submitting || !ticker} className="btn btn-primary w-full justify-center">
        {submitting ? <div className="spinner" /> : <Plus size={16} />}
        {t("submit")}
      </button>
      <p className="text-xs text-[var(--muted)]">{t("tip")}</p>
    </form>
  );
}
