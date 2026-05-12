"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RefreshCw, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Coins, Receipt, AlertCircle } from "lucide-react";
import { TickerSearch } from "@/components/TickerSearch";
import { fmtCurrency, fmtNumber } from "@/lib/format";

type TxType = "buy" | "sell" | "dividend" | "fee";

interface Transaction {
  _id: string;
  ticker: string;
  type: TxType;
  shares: number;
  price: number;
  amount?: number;
  currency: string;
  fees: number;
  date: string;
  notes?: string;
  createdAt: string;
}

interface RealizedGain {
  _id: string;
  ticker: string;
  shares: number;
  avgBuyPrice: number;
  sellPrice: number;
  currency: string;
  gainBase: number;
  baseCurrency: string;
  saleDate: string;
}

interface YearlyTotal {
  year: number;
  total: number;
  count: number;
}

const TYPE_ICONS: Record<TxType, React.ComponentType<{ size?: number; className?: string }>> = {
  buy: ArrowDownCircle,
  sell: ArrowUpCircle,
  dividend: Coins,
  fee: Receipt,
};

const TYPE_COLORS: Record<TxType, string> = {
  buy: "text-[var(--green)]",
  sell: "text-[var(--red)]",
  dividend: "text-yellow-400",
  fee: "text-[var(--muted)]",
};

const TX_TYPES: TxType[] = ["buy", "sell", "dividend", "fee"];

export default function TransactionsPage() {
  const t = useTranslations("Transactions");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [gains, setGains] = useState<RealizedGain[]>([]);
  const [yearly, setYearly] = useState<YearlyTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [txType, setTxType] = useState<TxType>("buy");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, gRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/realized-gains"),
      ]);
      const tData = await tRes.json();
      const g = await gRes.json();
      setTransactions(Array.isArray(tData) ? tData : []);
      setGains(g.gains || []);
      setYearly(g.yearlyTotals || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker) {
      setError(t("selectTicker"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ticker,
        type: txType,
        currency,
        date,
        fees: parseFloat(fees.replace(",", ".")) || 0,
        notes,
      };
      if (txType === "buy" || txType === "sell") {
        body.shares = parseFloat(shares.replace(",", "."));
        body.price = parseFloat(price.replace(",", "."));
      } else if (txType === "dividend") {
        body.amount = parseFloat(amount.replace(",", "."));
      } else if (txType === "fee") {
        body.amount = parseFloat(amount.replace(",", "."));
      }
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("errorGeneric"));
      }
      setTicker("");
      setShares("");
      setPrice("");
      setAmount("");
      setNotes("");
      setFees("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteTx(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    await load();
  }

  const totalYearGains = yearly[0]?.total || 0;
  const currentYear = yearly[0]?.year || new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-[var(--muted)]">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus size={14} /> {t("newTransaction")}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("type")}</label>
            <div className="grid grid-cols-4 gap-2">
              {TX_TYPES.map((tx) => {
                const Icon = TYPE_ICONS[tx];
                return (
                  <button
                    key={tx}
                    type="button"
                    onClick={() => setTxType(tx)}
                    className={`p-2 rounded-md border flex items-center gap-2 justify-center text-sm ${
                      txType === tx
                        ? "border-[var(--accent)] bg-blue-500/10"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    <Icon size={14} /> {t(`types.${tx}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("stock")}</label>
            <TickerSearch
              onSelect={async (r) => {
                setTicker(r.ticker);
                try {
                  const res = await fetch(
                    `/api/stocks/quote?tickers=${encodeURIComponent(r.ticker)}`
                  );
                  const q = await res.json();
                  if (q[0]?.currency) setCurrency(q[0].currency);
                } catch {}
              }}
              placeholder={ticker || t("tickerPlaceholder")}
            />
            {ticker && <div className="mt-2 text-sm">{ticker} · {currency}</div>}
          </div>

          {(txType === "buy" || txType === "sell") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  {t("shares")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  {t("pricePerShare")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          )}
          {(txType === "dividend" || txType === "fee") && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("amount")}</label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{t("date")}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("currency")}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input"
              >
                {["EUR", "USD", "GBP", "CHF", "JPY", "HKD", "SGD"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("fees")}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("noteOptional")}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
            />
          </div>

          {error && (
            <div className="text-sm text-[var(--red)] flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn">
              {t("cancel")}
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? <div className="spinner" /> : <Plus size={14} />}
              {t("save")}
            </button>
          </div>
        </form>
      )}

      {yearly.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">{t("realizedYear", { year: currentYear })}</div>
            <div
              className={`text-xl font-semibold num ${
                totalYearGains >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
              }`}
            >
              {fmtCurrency(totalYearGains, "EUR")}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">{t("totalTransactions")}</div>
            <div className="text-xl font-semibold num">{transactions.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">{t("dividendsReceived")}</div>
            <div className="text-xl font-semibold num">
              {transactions.filter((tx) => tx.type === "dividend").length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">{t("salesCount")}</div>
            <div className="text-xl font-semibold num">
              {transactions.filter((tx) => tx.type === "sell").length}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          {t("allTransactions")}
        </h2>
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-3 py-3">{t("headers.date")}</th>
                <th className="text-left font-medium px-3 py-3">{t("headers.type")}</th>
                <th className="text-left font-medium px-3 py-3">{t("headers.ticker")}</th>
                <th className="text-right font-medium px-3 py-3">{t("headers.count")}</th>
                <th className="text-right font-medium px-3 py-3">{t("headers.priceAmount")}</th>
                <th className="text-right font-medium px-3 py-3">{t("headers.fee")}</th>
                <th className="text-right font-medium px-3 py-3">{t("headers.total")}</th>
                <th className="text-left font-medium px-3 py-3">{t("headers.note")}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-[var(--muted)]">
                    {t("noTransactions")}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const Icon = TYPE_ICONS[tx.type];
                  const total =
                    tx.type === "dividend" || tx.type === "fee"
                      ? tx.amount || 0
                      : tx.shares * tx.price + tx.fees;
                  return (
                    <tr key={tx._id} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-3 py-3 text-xs text-[var(--muted)]">
                        {new Date(tx.date).toLocaleDateString(numberLocale)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`flex items-center gap-1.5 ${TYPE_COLORS[tx.type]}`}>
                          <Icon size={13} /> {t(`types.${tx.type}`)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/analysis/${encodeURIComponent(tx.ticker)}`}
                          className="font-semibold hover:text-[var(--accent)]"
                        >
                          {tx.ticker}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right num text-xs">
                        {tx.shares > 0 ? fmtNumber(tx.shares, numberLocale, 2) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right num text-xs">
                        {tx.type === "dividend" || tx.type === "fee"
                          ? fmtCurrency(tx.amount || 0, tx.currency)
                          : fmtCurrency(tx.price, tx.currency)}
                      </td>
                      <td className="px-3 py-3 text-right num text-xs">
                        {tx.fees > 0 ? fmtCurrency(tx.fees, tx.currency) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right num font-medium">
                        {fmtCurrency(total, tx.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-[var(--muted)] truncate max-w-[150px]">
                        {tx.notes || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => deleteTx(tx._id)}
                          className="p-2 text-[var(--muted)] hover:text-[var(--red)]"
                          aria-label={t("deleteAria", {
                            ticker: tx.ticker,
                            date: new Date(tx.date).toLocaleDateString(numberLocale),
                          })}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {gains.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            {t("realizedGains")}
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3">{t("gainsHeaders.date")}</th>
                  <th className="text-left font-medium px-3 py-3">{t("gainsHeaders.ticker")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("gainsHeaders.count")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("gainsHeaders.avgBuy")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("gainsHeaders.sell")}</th>
                  <th className="text-right font-medium px-3 py-3">{t("gainsHeaders.pnl")}</th>
                </tr>
              </thead>
              <tbody>
                {gains.map((g) => (
                  <tr key={g._id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {new Date(g.saleDate).toLocaleDateString(numberLocale)}
                    </td>
                    <td className="px-3 py-3 font-semibold">{g.ticker}</td>
                    <td className="px-3 py-3 text-right num">
                      {fmtNumber(g.shares, numberLocale, 2)}
                    </td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtCurrency(g.avgBuyPrice, g.currency)}
                    </td>
                    <td className="px-3 py-3 text-right num text-xs">
                      {fmtCurrency(g.sellPrice, g.currency)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right num font-medium ${
                        g.gainBase >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                      }`}
                    >
                      {fmtCurrency(g.gainBase, g.baseCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
