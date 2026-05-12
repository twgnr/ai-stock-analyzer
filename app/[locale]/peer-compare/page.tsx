"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, AlertCircle, GitCompare, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TickerSearch } from "@/components/TickerSearch";
import { fmtCurrency, fmtPercent, changeClass } from "@/lib/format";
import { ConvictionBadge } from "@/components/ConvictionBadge";

interface CategoryComparison {
  a: string;
  b: string;
  winner: "A" | "B" | "tie";
}

interface PeerCompareResult {
  summary: string;
  valuation: CategoryComparison;
  growth: CategoryComparison;
  profitability: CategoryComparison;
  risks: CategoryComparison;
  moat: CategoryComparison;
  verdict: "A" | "B" | "tie";
  verdictReasoning: string;
  scenario: string;
  a: { ticker: string; name: string; price: number; currency: string; changePercent: number };
  b: { ticker: string; name: string; price: number; currency: string; changePercent: number };
}

const CATEGORY_KEYS = ["valuation", "growth", "profitability", "risks", "moat"] as const;
type CategoryKey = typeof CATEGORY_KEYS[number];

export default function PeerComparePage() {
  const t = useTranslations("PeerCompare");
  const [tickerA, setTickerA] = useState("");
  const [nameA, setNameA] = useState("");
  const [tickerB, setTickerB] = useState("");
  const [nameB, setNameB] = useState("");
  const [result, setResult] = useState<PeerCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!tickerA || !tickerB) {
      setError(t("selectBoth"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/peer-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickerA, tickerB }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitCompare size={22} className="text-[var(--accent)]" />
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted)]">{t("description")}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <label className="block text-xs font-medium text-[var(--muted)]">{t("stockA")}</label>
          <TickerSearch
            onSelect={(r) => {
              setTickerA(r.ticker);
              setNameA(r.name);
            }}
            placeholder={t("placeholderA")}
          />
          {tickerA && (
            <div className="text-sm">
              <span className="font-semibold">{tickerA}</span>{" "}
              <span className="text-[var(--muted)]">{nameA}</span>
            </div>
          )}
        </div>
        <div className="card p-4 space-y-2">
          <label className="block text-xs font-medium text-[var(--muted)]">{t("stockB")}</label>
          <TickerSearch
            onSelect={(r) => {
              setTickerB(r.ticker);
              setNameB(r.name);
            }}
            placeholder={t("placeholderB")}
          />
          {tickerB && (
            <div className="text-sm">
              <span className="font-semibold">{tickerB}</span>{" "}
              <span className="text-[var(--muted)]">{nameB}</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading || !tickerA || !tickerB}
        className="btn btn-primary"
      >
        {loading ? <div className="spinner" /> : <Sparkles size={14} />}
        {loading ? t("comparing") : t("compare")}
      </button>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <AssetCard
              asset={result.a}
              isWinner={result.verdict === "A"}
              sideLabel={t("asset", { side: "A" })}
              convictionLabel={t("conviction")}
              winnerLabel={t("winner")}
            />
            <AssetCard
              asset={result.b}
              isWinner={result.verdict === "B"}
              sideLabel={t("asset", { side: "B" })}
              convictionLabel={t("conviction")}
              winnerLabel={t("winner")}
            />
          </div>

          <div className="card p-5 space-y-3 border-[var(--accent)]/30 bg-blue-500/5">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-yellow-400" />
              <h2 className="font-semibold">{t("verdict")}</h2>
            </div>
            <div className="text-lg font-bold">
              {result.verdict === "tie"
                ? t("tieResult")
                : result.verdict === "A"
                ? `${result.a.ticker} ${t("winsSuffix")}`
                : `${result.b.ticker} ${t("winsSuffix")}`}
            </div>
            <p className="text-sm">{result.verdictReasoning}</p>
            <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
              <strong>{t("scenario")}</strong> {result.scenario}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">
              {t("summary")}
            </h2>
            <p className="text-sm">{result.summary}</p>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left font-medium px-3 py-3 w-32">{t("table.category")}</th>
                  <th className="text-left font-medium px-3 py-3">{result.a.ticker}</th>
                  <th className="text-left font-medium px-3 py-3">{result.b.ticker}</th>
                  <th className="text-center font-medium px-3 py-3 w-20">{t("table.winner")}</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((key) => {
                  const c = result[key] as CategoryComparison;
                  return (
                    <tr
                      key={key}
                      className="border-b border-[var(--border)] last:border-b-0 align-top"
                    >
                      <td className="px-3 py-3 font-medium">
                        {t(`categories.${key}` as `categories.${CategoryKey}`)}
                      </td>
                      <td
                        className={`px-3 py-3 text-sm ${
                          c.winner === "A" ? "text-[var(--green)]" : ""
                        }`}
                      >
                        {c.a}
                      </td>
                      <td
                        className={`px-3 py-3 text-sm ${
                          c.winner === "B" ? "text-[var(--green)]" : ""
                        }`}
                      >
                        {c.b}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.winner === "tie"
                              ? "bg-[var(--surface-2)] text-[var(--muted)]"
                              : "bg-green-500/10 text-[var(--green)]"
                          }`}
                        >
                          {c.winner === "A"
                            ? result.a.ticker
                            : c.winner === "B"
                            ? result.b.ticker
                            : t("table.tie")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-[var(--muted)] text-center">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  isWinner,
  sideLabel,
  convictionLabel,
  winnerLabel,
}: {
  asset: PeerCompareResult["a"];
  isWinner: boolean;
  sideLabel: string;
  convictionLabel: string;
  winnerLabel: string;
}) {
  return (
    <div
      className={`card p-4 ${
        isWinner ? "border-[var(--green)]/40 bg-green-500/5" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">{sideLabel}</div>
          <Link href={`/analysis/${encodeURIComponent(asset.ticker)}`}>
            <div className="text-xl font-bold hover:text-[var(--accent)]">{asset.ticker}</div>
            <div className="text-sm text-[var(--muted)]">{asset.name}</div>
          </Link>
        </div>
        <div className="text-right">
          <div className="num font-semibold">{fmtCurrency(asset.price, asset.currency)}</div>
          <div className={`text-xs num ${changeClass(asset.changePercent)}`}>
            {fmtPercent(asset.changePercent)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--muted)]">{convictionLabel}</span>
        <ConvictionBadge ticker={asset.ticker} />
        {isWinner && (
          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-[var(--green)] flex items-center gap-1">
            <Trophy size={11} /> {winnerLabel}
          </span>
        )}
      </div>
    </div>
  );
}
