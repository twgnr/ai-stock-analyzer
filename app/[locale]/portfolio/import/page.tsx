"use client";

import { useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Upload,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  FileText,
  Download,
} from "lucide-react";
import { fmtNumber } from "@/lib/format";

const BROKER_KEYS = ["comdirect", "tradeRepublic", "ibkr", "generic"] as const;

interface Preview {
  ticker: string;
  type: "buy" | "sell" | "dividend" | "fee";
  shares: number;
  price: number;
  currency: string;
  fees: number;
  date: string;
  notes?: string;
  externalRef: string;
}

interface PreviewPayload {
  preview: Preview[];
  warnings: string[];
  rawRowCount: number;
  skippedRows: number;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

export default function PortfolioImportPage() {
  const t = useTranslations("Portfolio");
  const ti = useTranslations("Portfolio.import");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [broker, setBroker] = useState<(typeof BROKER_KEYS)[number]>("comdirect");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview(file: File) {
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("broker", broker);
      form.append("mode", "preview");
      const res = await fetch("/api/portfolio/import-broker", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : ti("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("broker", broker);
      form.append("mode", "import");
      const res = await fetch("/api/portfolio/import-broker", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : ti("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    runPreview(f);
    e.target.value = "";
  }

  const currentBrokerHint = ti(
    `brokerHints.${broker}` as Parameters<typeof ti>[0]
  );

  return (
    <div className="space-y-6">
      <Link
        href="/portfolio"
        className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> {t("backToPortfolio")}
      </Link>

      <div className="flex items-center gap-2">
        <Download size={22} className="text-[var(--accent)]" />
        <h1 className="text-2xl font-semibold">{ti("title")}</h1>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {ti("description")}
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            {ti("broker")}
          </label>
          <select
            value={broker}
            onChange={(e) => setBroker(e.target.value as (typeof BROKER_KEYS)[number])}
            className="input"
            disabled={loading}
          >
            {BROKER_KEYS.map((k) => (
              <option key={k} value={k}>
                {ti(`brokerLabels.${k}` as Parameters<typeof ti>[0])}
              </option>
            ))}
          </select>
          {currentBrokerHint && (
            <p className="text-xs text-[var(--muted)] mt-1">
              {currentBrokerHint}
            </p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileSelected}
          className="hidden"
          disabled={loading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? <div className="spinner" /> : <Upload size={14} />}
          {ti("chooseFile")}
        </button>
        {file && (
          <div className="text-xs text-[var(--muted)] flex items-center gap-1">
            <FileText size={12} /> {file.name}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="card p-4 space-y-2 border-[var(--green)]/30">
          <div className="flex items-center gap-2 text-[var(--green)]">
            <CheckCircle2 size={18} />
            <span className="font-semibold">{ti("importDone")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat label={ti("imported")} value={String(result.imported)} tone="green" />
            <Stat label={ti("duplicates")} value={String(result.duplicates)} tone="muted" />
            <Stat label={ti("skipped")} value={String(result.skipped)} tone="muted" />
          </div>
          {result.warnings.length > 0 && (
            <details className="text-xs text-[var(--muted)]">
              <summary className="cursor-pointer">
                {ti("warnings", { count: result.warnings.length })}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && (
            <details className="text-xs text-[var(--red)]">
              <summary className="cursor-pointer">
                {ti("errorsLabel", { count: result.errors.length })}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </details>
          )}
          <Link href="/transactions" className="btn btn-primary text-sm">
            {ti("toTransactions")}
          </Link>
        </div>
      )}

      {preview && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <strong>{ti("previewCount", { count: preview.preview.length })}</strong>
              {preview.skippedRows > 0 && (
                <span className="text-[var(--muted)]">
                  {" "}
                  {ti("previewSkipped", { count: preview.skippedRows })}
                </span>
              )}
            </div>
            <button
              onClick={runImport}
              disabled={loading || preview.preview.length === 0}
              className="btn btn-primary"
            >
              {loading ? <div className="spinner" /> : <CheckCircle2 size={14} />}
              {ti("importBtn", { count: preview.preview.length })}
            </button>
          </div>

          {preview.warnings.length > 0 && (
            <details className="card p-3 text-xs text-yellow-400">
              <summary className="cursor-pointer">
                {ti("warnings", { count: preview.warnings.length })}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </details>
          )}

          {preview.preview.length > 0 && (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">{ti("headers.date")}</th>
                    <th className="text-left font-medium px-3 py-2">{ti("headers.ticker")}</th>
                    <th className="text-left font-medium px-3 py-2">{ti("headers.type")}</th>
                    <th className="text-right font-medium px-3 py-2">{ti("headers.shares")}</th>
                    <th className="text-right font-medium px-3 py-2">{ti("headers.price")}</th>
                    <th className="text-right font-medium px-3 py-2">{ti("headers.fee")}</th>
                    <th className="text-left font-medium px-3 py-2">{ti("headers.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 100).map((p, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-2 text-xs num">
                        {new Date(p.date).toLocaleDateString(numberLocale)}
                      </td>
                      <td className="px-3 py-2 font-medium">{p.ticker}</td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            p.type === "buy"
                              ? "text-[var(--green)]"
                              : p.type === "sell"
                                ? "text-[var(--red)]"
                                : "text-[var(--muted)]"
                          }
                        >
                          {p.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num text-xs">
                        {fmtNumber(p.shares, numberLocale, 4)}
                      </td>
                      <td className="px-3 py-2 text-right num text-xs">
                        {fmtNumber(p.price, numberLocale, 2)} {p.currency}
                      </td>
                      <td className="px-3 py-2 text-right num text-xs text-[var(--muted)]">
                        {p.fees > 0 ? fmtNumber(p.fees, numberLocale, 2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--muted)] truncate max-w-[200px]">
                        {p.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.preview.length > 100 && (
                <div className="p-3 text-xs text-[var(--muted)] text-center">
                  {ti("moreRows", { count: preview.preview.length - 100 })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "muted";
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)]"
      : "text-[var(--muted)]";
  return (
    <div className="border border-[var(--border)] rounded p-2">
      <div className={`text-xs ${color}`}>{label}</div>
      <div className="text-lg num font-semibold">{value}</div>
    </div>
  );
}
