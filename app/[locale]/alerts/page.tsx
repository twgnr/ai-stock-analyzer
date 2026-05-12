"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  History,
  Activity,
  DollarSign,
} from "lucide-react";
import { TickerSearch } from "@/components/TickerSearch";
import { fmtCurrency } from "@/lib/format";

type AlertType = "price" | "indicator";

interface Alert {
  _id: string;
  ticker: string;
  type?: AlertType;
  direction?: "above" | "below";
  threshold?: number;
  currency?: string;
  indicatorCondition?: string;
  active: boolean;
  triggeredAt?: string;
  notes?: string;
  createdAt: string;
}

type IndicatorOption = {
  key: string;
  group: "oscillator" | "trendFollowing" | "volatility";
};

const INDICATOR_OPTIONS: IndicatorOption[] = [
  { key: "rsi_below_30", group: "oscillator" },
  { key: "rsi_above_70", group: "oscillator" },
  { key: "macd_bullish_cross", group: "oscillator" },
  { key: "macd_bearish_cross", group: "oscillator" },
  { key: "sma_golden_cross", group: "trendFollowing" },
  { key: "sma_death_cross", group: "trendFollowing" },
  { key: "price_above_sma200", group: "trendFollowing" },
  { key: "price_below_sma200", group: "trendFollowing" },
  { key: "bb_breakout_upper", group: "volatility" },
  { key: "bb_breakout_lower", group: "volatility" },
];

export default function AlertsPage() {
  const t = useTranslations("Alerts");
  const locale = useLocale();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  function indicatorLabel(key: string): string {
    if (!key) return key;
    const opt = INDICATOR_OPTIONS.find((o) => o.key === key);
    if (!opt) return key;
    return t(`indicators.options.${key}` as never);
  }
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("price");
  const [ticker, setTicker] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("below");
  const [threshold, setThreshold] = useState("");
  const [indicatorCondition, setIndicatorCondition] = useState("rsi_below_30");
  const [notes, setNotes] = useState("");
  // Default-Währung ist EUR — damit der User von Anfang an in seiner
  // Hauswährung denkt. Über das Dropdown unten kann er auf USD/GBP/CHF/...
  // umschalten, wenn er die Originalwährung der Aktie nutzen möchte.
  const [currency, setCurrency] = useState("EUR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FX-Raten zur Konvertierung der Schwellenwerte in der Alert-Liste.
  // base = EUR; rates[X] gibt an, wie viele EUR ein X wert ist.
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const list = (await res.json()) as Alert[];
      setAlerts(list);

      // Alle Fremdwährungen sammeln und FX-Raten zur Anzeige in EUR holen.
      const ccyList = Array.from(
        new Set(
          list
            .map((a) => (a.currency || "").toUpperCase())
            .filter((c) => c && c !== "EUR")
        )
      );
      if (ccyList.length === 0) {
        setFxRates({});
      } else {
        try {
          const fxRes = await fetch(
            `/api/fx?currencies=${encodeURIComponent(ccyList.join(","))}&base=EUR`
          );
          const fx = await fxRes.json();
          if (fx?.rates && typeof fx.rates === "object") {
            setFxRates(fx.rates as Record<string, number>);
          }
        } catch {
          // FX nicht erreichbar → wir zeigen Werte fallback in Originalwährung.
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function formatThresholdEur(threshold: number, ccy: string): string {
    const upper = (ccy || "").toUpperCase();
    if (upper === "EUR" || !upper) return fmtCurrency(threshold, "EUR");
    const rate = fxRates[upper];
    if (typeof rate === "number" && rate > 0) {
      return fmtCurrency(threshold * rate, "EUR");
    }
    // FX nicht verfügbar — Originalwährung zeigen, damit der User wenigstens
    // einen Wert sieht.
    return fmtCurrency(threshold, upper);
  }

  useEffect(() => {
    load();
  }, []);

  // Prefill aus Query-Params, z.B. wenn der User von der Aktien-Detail-Seite
  // her per „Alert anlegen"-Button kommt: ?new=1&ticker=AAPL&price=185.42&
  // currency=USD&threshold=194.69&direction=above. Threshold und Direction
  // sind optional — fallback ist „über aktueller Kurs +5 %".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const newFlag = params.get("new");
    const tk = params.get("ticker");
    if (!newFlag && !tk) return;
    if (tk) setTicker(tk.toUpperCase());
    const cur = params.get("currency");
    if (cur) setCurrency(cur.toUpperCase());
    const dir = params.get("direction");
    if (dir === "above" || dir === "below") setDirection(dir);
    const thr = params.get("threshold");
    const price = params.get("price");
    if (thr) {
      setThreshold(thr);
    } else if (price) {
      // Kein expliziter Schwellwert — Standard-Vorschlag +5 %.
      const p = parseFloat(price);
      if (Number.isFinite(p) && p > 0) {
        setThreshold((p * 1.05).toFixed(2));
      }
    }
    setAlertType("price");
    setShowForm(true);
    // Hash/Query aus der Adresszeile entfernen, damit ein späterer Reload
    // nicht denselben Prefill erneut auslöst — die Seite gehört dem User.
    try {
      window.history.replaceState({}, "", "/alerts");
    } catch {}
    // Bewusst nur einmal beim Mount auswerten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker) {
      setError(t("errors.tickerRequired"));
      return;
    }
    if (alertType === "price" && !threshold) {
      setError(t("errors.thresholdRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body =
        alertType === "price"
          ? {
              ticker,
              type: "price",
              direction,
              threshold: parseFloat(threshold.replace(",", ".")),
              currency,
              notes,
            }
          : {
              ticker,
              type: "indicator",
              indicatorCondition,
              notes,
            };
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || t("errors.generic"));
      setTicker("");
      setThreshold("");
      setNotes("");
      setCurrency("EUR");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(a: Alert) {
    await fetch(`/api/alerts/${a._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    load();
  }

  const groupOrder: Array<IndicatorOption["group"]> = [
    "oscillator",
    "trendFollowing",
    "volatility",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell size={22} className="text-[var(--accent)]" />
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/alerts/history" className="btn">
            <History size={14} /> {t("history")}
          </Link>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus size={14} /> {t("newAlert")}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAlertType("price")}
              className={`btn flex-1 justify-center ${alertType === "price" ? "btn-primary" : ""}`}
            >
              <DollarSign size={14} /> {t("priceAlert")}
            </button>
            <button
              type="button"
              onClick={() => setAlertType("indicator")}
              className={`btn flex-1 justify-center ${alertType === "indicator" ? "btn-primary" : ""}`}
            >
              <Activity size={14} /> {t("indicatorAlert")}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("stock")}
            </label>
            <TickerSearch
              onSelect={async (r) => {
                setTicker(r.ticker);
                if (alertType !== "price") return;
                try {
                  const qRes = await fetch(
                    `/api/stocks/quote?tickers=${encodeURIComponent(r.ticker)}`
                  );
                  const q = await qRes.json();
                  if (!q[0]) return;
                  const native = q[0];
                  const targetCcy = currency || "EUR";
                  // Wenn die Schwellen-Währung der nativen entspricht: direkt
                  // den Yahoo-Kurs übernehmen. Sonst per FX umrechnen.
                  if (native.currency?.toUpperCase() === targetCcy) {
                    setThreshold(native.price.toFixed(2));
                    return;
                  }
                  try {
                    const fxRes = await fetch(
                      `/api/fx?currencies=${encodeURIComponent(native.currency)}&base=${encodeURIComponent(targetCcy)}`
                    );
                    const fx = await fxRes.json();
                    const rate = fx?.rates?.[native.currency.toUpperCase()];
                    if (typeof rate === "number" && rate > 0) {
                      setThreshold((native.price * rate).toFixed(2));
                    } else {
                      setThreshold(native.price.toFixed(2));
                    }
                  } catch {
                    setThreshold(native.price.toFixed(2));
                  }
                } catch {}
              }}
              placeholder={ticker || t("tickerPlaceholder")}
            />
          </div>

          {alertType === "price" ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  {t("direction")}
                </label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "above" | "below")}
                  className="input"
                >
                  <option value="below">{t("directionBelow")}</option>
                  <option value="above">{t("directionAbove")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  {t("threshold")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label
                  htmlFor="alert-currency"
                  className="block text-xs font-medium text-[var(--muted)] mb-1.5"
                >
                  {t("currency")}
                </label>
                <select
                  id="alert-currency"
                  value={currency || "EUR"}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="input"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                  <option value="JPY">JPY</option>
                  <option value="AUD">AUD</option>
                  <option value="CAD">CAD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {t("condition")}
              </label>
              <select
                value={indicatorCondition}
                onChange={(e) => setIndicatorCondition(e.target.value)}
                className="input"
              >
                {groupOrder.map((grp) => (
                  <optgroup key={grp} label={t(`indicators.groups.${grp}` as never)}>
                    {INDICATOR_OPTIONS.filter((o) => o.group === grp).map((o) => (
                      <option key={o.key} value={o.key}>
                        {t(`indicators.options.${o.key}` as never)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-[var(--muted)] mt-1">
                {t("indicatorHint")}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {t("note")}
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
              {t("create")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-6 text-center text-[var(--muted)]">
          <div className="spinner mb-2" /> {t("loading")}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {t("empty")}
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left font-medium px-3 py-3">{t("columns.status")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.ticker")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.type")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.rule")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.note")}</th>
                <th className="text-left font-medium px-3 py-3">{t("columns.created")}</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a._id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-3 py-3">
                    <button
                      onClick={() => toggleActive(a)}
                      className={`flex items-center gap-1.5 text-xs ${
                        a.triggeredAt
                          ? "text-yellow-400"
                          : a.active
                            ? "text-[var(--green)]"
                            : "text-[var(--muted)]"
                      }`}
                      title={a.active ? t("deactivate") : t("activate")}
                    >
                      {a.active ? <Bell size={12} /> : <BellOff size={12} />}
                      {a.triggeredAt
                        ? t("statusTriggered")
                        : a.active
                          ? t("statusActive")
                          : t("statusPaused")}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/analysis/${encodeURIComponent(a.ticker)}`}
                      className="font-semibold hover:text-[var(--accent)]"
                    >
                      {a.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {a.type === "indicator" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--accent)]">
                        <Activity size={11} /> {t("indicator")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                        <DollarSign size={11} /> {t("price")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {a.type === "indicator" ? (
                      <span>{indicatorLabel(a.indicatorCondition || "")}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        {a.direction === "above" ? (
                          <ArrowUpCircle size={12} className="text-[var(--green)]" />
                        ) : (
                          <ArrowDownCircle size={12} className="text-[var(--red)]" />
                        )}
                        {a.direction === "above" ? "≥" : "≤"}{" "}
                        {a.threshold != null && a.currency
                          ? formatThresholdEur(a.threshold, a.currency)
                          : "?"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)] truncate max-w-[200px]">
                    {a.notes || "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {new Date(a.createdAt).toLocaleDateString(dateLocale)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => remove(a._id)}
                      className="p-2 text-[var(--muted)] hover:text-[var(--red)]"
                      aria-label={t("deleteAria", { ticker: a.ticker })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
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
