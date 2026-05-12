"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Printer, ArrowLeft, FileText, AlertCircle } from "lucide-react";
import { enrichPortfolio } from "@/lib/enrichPortfolio";
import { type EnrichedPosition } from "@/components/PortfolioTable";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";

interface Allocation {
  label: string;
  valueBase: number;
  weight: number;
  tickers: string[];
}

interface AllocationPayload {
  sectors: Allocation[];
  regions: Allocation[];
  totalValueBase: number;
  baseCurrency: string;
}

interface YearTotal {
  year: number;
  total: number;
  count: number;
}

export default function PortfolioReportPage() {
  const t = useTranslations("Portfolio");
  const tr = useTranslations("Portfolio.report");
  const locale = useLocale();
  const numberLocale = locale === "de" ? "de-DE" : "en-US";
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [allocation, setAllocation] = useState<AllocationPayload | null>(null);
  const [yearlyTotals, setYearlyTotals] = useState<YearTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawRes, allocRes, gainsRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/portfolio/allocation"),
        fetch("/api/realized-gains"),
      ]);
      if (rawRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const raw = await rawRes.json();
      if (!Array.isArray(raw)) {
        setError(raw.error || tr("apiError"));
        return;
      }
      if (raw.length > 0) {
        const tickers = raw.map((p) => p.ticker).join(",");
        const [qRes] = await Promise.all([
          fetch(`/api/stocks/quote?tickers=${encodeURIComponent(tickers)}`),
        ]);
        const quotes = await qRes.json();
        const currencies = [
          ...new Set<string>(
            quotes
              .map((q: { currency: string }) => q.currency)
              .concat(raw.map((p: { currency: string }) => p.currency))
          ),
        ];
        const fxRes = await fetch(
          `/api/fx?currencies=${encodeURIComponent(currencies.join(","))}`
        );
        const fxData = (await fxRes.json()) as {
          base: string;
          rates: Record<string, number>;
        };
        setPositions(
          enrichPortfolio(raw, quotes, fxData.rates || {}, fxData.base || "EUR")
        );
      } else {
        setPositions([]);
      }

      const allocData = await allocRes.json();
      if (!allocData.error) setAllocation(allocData);

      const gainsData = await gainsRes.json();
      if (!gainsData.error) {
        setYearlyTotals(Array.isArray(gainsData.yearlyTotals) ? gainsData.yearlyTotals : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("loadError"));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    load();
  }, [load]);

  const baseCurrency = allocation?.baseCurrency || positions[0]?.baseCurrency || "EUR";
  const totalValue = positions.reduce((s, p) => s + p.marketValueBase, 0);
  const totalCost = positions.reduce((s, p) => s + p.costBasisBase, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost ? (totalPL / totalCost) * 100 : 0;
  const todayChange = positions.reduce((s, p) => s + p.todayChangeBase, 0);

  const currentYear = generatedAt.getFullYear();
  const ytd = yearlyTotals.find((t) => t.year === currentYear);
  const ytdText = ytd
    ? `${ytd.total >= 0 ? "+" : ""}${fmtCurrency(ytd.total, baseCurrency)} (${ytd.count} ${tr("tradesCol")})`
    : "—";

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link
          href="/portfolio"
          className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> {t("backToPortfolio")}
        </Link>

        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div className="flex items-center gap-2">
            <FileText size={22} className="text-[var(--accent)]" />
            <h1 className="text-2xl font-semibold">{tr("title")}</h1>
          </div>
          <button onClick={() => window.print()} className="btn btn-primary">
            <Printer size={14} />
            {tr("print")}
          </button>
        </div>

        <div className="card p-4 text-xs text-[var(--muted)] mt-4">
          {tr("printHint")}
        </div>
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm no-print">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)] no-print">
          <div className="spinner mb-2" />
          {tr("loading")}
        </div>
      ) : (
        <div className="report-content space-y-6 print:text-black print:bg-white">
          <header className="border-b border-[var(--border)] print:border-gray-300 pb-4">
            <h2 className="text-xl font-semibold">{tr("title")}</h2>
            <p className="text-sm text-[var(--muted)] print:text-gray-600">
              {tr("asOf", {
                date: generatedAt.toLocaleDateString(numberLocale),
                time: generatedAt.toLocaleTimeString(numberLocale),
              })}
            </p>
          </header>

          <section>
            <h3 className="font-semibold mb-2">{tr("overview")}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
              <ReportStat
                label={tr("totalValue")}
                value={fmtCurrency(totalValue, baseCurrency)}
              />
              <ReportStat
                label={tr("cost")}
                value={fmtCurrency(totalCost, baseCurrency)}
              />
              <ReportStat
                label={tr("totalPL")}
                value={`${totalPL >= 0 ? "+" : ""}${fmtCurrency(totalPL, baseCurrency)}`}
                sub={fmtPercent(totalPLPct)}
                tone={totalPL >= 0 ? "green" : "red"}
              />
              <ReportStat
                label={tr("today")}
                value={`${todayChange >= 0 ? "+" : ""}${fmtCurrency(todayChange, baseCurrency)}`}
                tone={todayChange >= 0 ? "green" : "red"}
              />
            </div>
            <div className="text-xs text-[var(--muted)] print:text-gray-600 mt-2">
              {tr("positionsCount", {
                count: positions.length,
                year: currentYear,
                ytd: ytdText,
              })}
            </div>
          </section>

          {positions.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">{tr("positionsHeading")}</h3>
              <div className="card overflow-hidden print:border-gray-300 print:rounded-none">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] print:text-gray-700 border-b border-[var(--border)] print:border-gray-300">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">{tr("headerTicker")}</th>
                      <th className="text-left font-medium px-3 py-2">{tr("headerName")}</th>
                      <th className="text-right font-medium px-3 py-2">{tr("headerShares")}</th>
                      <th className="text-right font-medium px-3 py-2">{tr("headerAvgPrice")}</th>
                      <th className="text-right font-medium px-3 py-2">{tr("headerPrice")}</th>
                      <th className="text-right font-medium px-3 py-2">
                        {tr("headerValueIn", { currency: baseCurrency })}
                      </th>
                      <th className="text-right font-medium px-3 py-2">{tr("headerPnlPct")}</th>
                      <th className="text-right font-medium px-3 py-2">{tr("headerWeightPct")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr
                        key={p._id}
                        className="border-b border-[var(--border)] print:border-gray-300 last:border-b-0"
                      >
                        <td className="px-3 py-2 font-medium">{p.ticker}</td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)] print:text-gray-600">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-right num">
                          {fmtNumber(p.shares, numberLocale, 4)}
                        </td>
                        <td className="px-3 py-2 text-right num text-xs">
                          {fmtNumber(p.avgPrice, numberLocale, 2)} {p.purchaseCurrency}
                        </td>
                        <td className="px-3 py-2 text-right num text-xs">
                          {fmtNumber(p.currentPrice, numberLocale, 2)} {p.tradingCurrency}
                        </td>
                        <td className="px-3 py-2 text-right num">
                          {fmtCurrency(p.marketValueBase, baseCurrency)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            p.unrealizedPctBase >= 0
                              ? "text-[var(--green)] print:text-green-700"
                              : "text-[var(--red)] print:text-red-700"
                          }`}
                        >
                          {p.unrealizedPctBase >= 0 ? "+" : ""}
                          {fmtPercent(p.unrealizedPctBase)}
                        </td>
                        <td className="px-3 py-2 text-right num text-xs">
                          {fmtPercent(p.weight)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {allocation && allocation.sectors.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">{tr("sectorAllocation")}</h3>
              <AllocationTable
                items={allocation.sectors}
                baseCurrency={baseCurrency}
              />
            </section>
          )}

          {allocation && allocation.regions.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">{tr("regionAllocation")}</h3>
              <AllocationTable
                items={allocation.regions}
                baseCurrency={baseCurrency}
              />
            </section>
          )}

          {yearlyTotals.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">
                {tr("realizedByYear")}
              </h3>
              <div className="card overflow-hidden print:border-gray-300 print:rounded-none">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--muted)] print:text-gray-700 border-b border-[var(--border)] print:border-gray-300">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">{tr("yearCol")}</th>
                      <th className="text-right font-medium px-3 py-2">{tr("tradesCol")}</th>
                      <th className="text-right font-medium px-3 py-2">
                        {tr("netPL", { currency: baseCurrency })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyTotals.map((y) => (
                      <tr
                        key={y.year}
                        className="border-b border-[var(--border)] print:border-gray-300 last:border-b-0"
                      >
                        <td className="px-3 py-2 num">{y.year}</td>
                        <td className="px-3 py-2 text-right num">{y.count}</td>
                        <td
                          className={`px-3 py-2 text-right num ${
                            y.total >= 0
                              ? "text-[var(--green)] print:text-green-700"
                              : "text-[var(--red)] print:text-red-700"
                          }`}
                        >
                          {y.total >= 0 ? "+" : ""}
                          {fmtCurrency(y.total, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="text-xs text-[var(--muted)] print:text-gray-600 pt-4 border-t border-[var(--border)] print:border-gray-300">
            {tr("footer")}
          </footer>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body,
          html {
            background: white !important;
            color: black !important;
          }
          nav,
          header.site-header,
          .no-print {
            display: none !important;
          }
          main {
            max-width: 100% !important;
            padding: 0 !important;
          }
          .card {
            background: white !important;
            border-color: #ccc !important;
            box-shadow: none !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          .report-content {
            color: black !important;
          }
        }
      `}</style>
    </div>
  );
}

function ReportStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)] print:text-green-700"
      : tone === "red"
        ? "text-[var(--red)] print:text-red-700"
        : "";
  return (
    <div className="card p-3 print:border-gray-300 print:rounded-none">
      <div className="text-xs text-[var(--muted)] print:text-gray-600">
        {label}
      </div>
      <div className={`text-lg font-semibold num ${color}`}>{value}</div>
      {sub && (
        <div className={`text-xs num ${color}`}>{sub}</div>
      )}
    </div>
  );
}

function AllocationTable({
  items,
  baseCurrency,
}: {
  items: Allocation[];
  baseCurrency: string;
}) {
  const tr = useTranslations("Portfolio.report");
  return (
    <div className="card overflow-hidden print:border-gray-300 print:rounded-none">
      <table className="w-full text-sm">
        <thead className="text-xs text-[var(--muted)] print:text-gray-700 border-b border-[var(--border)] print:border-gray-300">
          <tr>
            <th className="text-left font-medium px-3 py-2">{tr("allocCategory")}</th>
            <th className="text-right font-medium px-3 py-2">
              {tr("allocValue", { currency: baseCurrency })}
            </th>
            <th className="text-right font-medium px-3 py-2">{tr("allocShare")}</th>
            <th className="text-left font-medium px-3 py-2">{tr("allocTickers")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.label}
              className="border-b border-[var(--border)] print:border-gray-300 last:border-b-0"
            >
              <td className="px-3 py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2 text-right num">
                {fmtCurrency(r.valueBase, baseCurrency)}
              </td>
              <td className="px-3 py-2 text-right num">
                {fmtPercent(r.weight)}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--muted)] print:text-gray-600">
                {r.tickers.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
