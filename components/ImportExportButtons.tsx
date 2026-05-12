"use client";

import { useRef, useState } from "react";
import { Download, Upload, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  onImported: () => void;
}

export function ImportExportButtons({ onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<
    | { imported: number; errors: string[] }
    | { error: string }
    | null
  >(null);

  function exportCsv() {
    window.open("/api/portfolio/export", "_blank");
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Import fehlgeschlagen" });
      } else {
        setResult(data);
        onImported();
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Fehler" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <button onClick={exportCsv} className="btn">
          <Download size={14} /> CSV-Export
        </button>
        <button onClick={pickFile} disabled={importing} className="btn">
          {importing ? <div className="spinner" /> : <Upload size={14} />}
          CSV-Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      {result && "error" in result && (
        <div className="text-xs text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded px-3 py-2 flex items-center gap-2 w-full mt-2">
          <AlertCircle size={14} /> {result.error}
        </div>
      )}
      {result && "imported" in result && (
        <div className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 w-full mt-2">
          <div className="flex items-center gap-2 text-[var(--green)]">
            <CheckCircle2 size={14} /> {result.imported} Positionen importiert
          </div>
          {result.errors?.length > 0 && (
            <ul className="text-[var(--muted)] text-[11px] mt-1 space-y-0.5">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
