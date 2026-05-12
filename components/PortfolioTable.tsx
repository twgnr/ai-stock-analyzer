"use client";

import Link from "next/link";
import { Trash2, Pencil } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent, changeClass } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { TickerLink } from "@/components/TickerLink";

export interface EnrichedPosition {
  _id: string;
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  avgPriceBase: number;
  currentPrice: number;
  currentPriceBase: number;
  purchaseCurrency: string;
  tradingCurrency: string;
  change: number;
  changePercent: number;
  marketValue: number;
  marketValueBase: number;
  costBasis: number;
  costBasisBase: number;
  unrealizedPL: number;
  unrealizedPLBase: number;
  unrealizedPct: number;
  unrealizedPctBase: number;
  weight: number;
  todayChangeBase: number;
  tradingRate: number;
  purchaseRate: number;
  baseCurrency: string;
}

interface Props {
  positions: EnrichedPosition[];
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Map ticker → letzte ~3-Monats-Closes für Trend-Sparkline. Optional. */
  sparklines?: Record<string, number[]>;
}

export function PortfolioTable({ positions, showActions, onEdit, onDelete, sparklines }: Props) {
  if (positions.length === 0) {
    return (
      <div className="card p-8 text-center text-[var(--muted)]">
        Noch keine Positionen im Portfolio.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card-Layout — bis md */}
      <div className="md:hidden space-y-2">
        {positions.map((p) => (
          <PositionCard
            key={p._id}
            position={p}
            showActions={showActions}
            onEdit={onEdit}
            onDelete={onDelete}
            spark={sparklines?.[p.ticker.toUpperCase()]}
          />
        ))}
      </div>

      {/* Desktop: Tabelle ab md */}
      <div className="hidden md:block card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-[var(--muted)] border-b border-[var(--border)]">
            <tr>
              <th data-help="col:portfolio:ticker" className="text-left font-medium px-4 py-3">
                Ticker
              </th>
              <th data-help="col:portfolio:shares" className="text-right font-medium px-4 py-3">
                Anzahl
              </th>
              <th data-help="col:portfolio:avg-price" className="text-right font-medium px-4 py-3">
                Ø Kauf
              </th>
              <th data-help="col:portfolio:current" className="text-right font-medium px-4 py-3">
                Aktuell
              </th>
              <th
                data-help="col:portfolio:trend"
                className="text-center font-medium px-2 py-3 w-[110px]"
              >
                Trend (3M)
              </th>
              <th data-help="col:portfolio:today" className="text-right font-medium px-4 py-3">
                Heute
              </th>
              <th data-help="col:portfolio:value" className="text-right font-medium px-4 py-3">
                Wert
              </th>
              <th data-help="col:portfolio:pnl" className="text-right font-medium px-4 py-3">
                G/V
              </th>
              <th data-help="col:portfolio:weight" className="text-right font-medium px-4 py-3">
                Gewicht
              </th>
              {showActions && <th data-help="col:portfolio:actions" className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const base = p.baseCurrency;
              const purchaseDiffers = p.purchaseCurrency !== base;
              const tradingDiffers = p.tradingCurrency !== base;
              return (
                <tr
                  key={p._id}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-3">
                    <TickerLink ticker={p.ticker}>
                      <span className="block">
                        <span className="block font-semibold">{p.ticker}</span>
                        <span className="block text-xs text-[var(--muted)] truncate max-w-[200px]">
                          {p.name}
                        </span>
                      </span>
                    </TickerLink>
                  </td>
                  <td className="px-4 py-3 text-right num">
                    {fmtNumber(p.shares, "de-DE", p.shares % 1 === 0 ? 0 : 2)}
                  </td>
                  <td className="px-4 py-3 text-right num text-[var(--muted)]">
                    <div>{fmtCurrency(p.avgPriceBase, base)}</div>
                    {purchaseDiffers && (
                      <div className="text-xs opacity-60">
                        {fmtCurrency(p.avgPrice, p.purchaseCurrency)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right num">
                    <div>{fmtCurrency(p.currentPriceBase, base)}</div>
                    {tradingDiffers && (
                      <div className="text-xs text-[var(--muted)] opacity-60">
                        {fmtCurrency(p.currentPrice, p.tradingCurrency)}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {sparklines?.[p.ticker.toUpperCase()]?.length ? (
                      <div className="flex justify-center">
                        <Sparkline
                          data={sparklines[p.ticker.toUpperCase()]}
                          width={90}
                          height={26}
                        />
                      </div>
                    ) : (
                      <div className="text-center text-[var(--muted)] opacity-40 text-xs">
                        —
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right num ${changeClass(p.changePercent)}`}>
                    {fmtPercent(p.changePercent)}
                  </td>
                  <td className="px-4 py-3 text-right num font-medium">
                    {fmtCurrency(p.marketValueBase, base)}
                  </td>
                  <td className={`px-4 py-3 text-right num ${changeClass(p.unrealizedPLBase)}`}>
                    <div>{fmtCurrency(p.unrealizedPLBase, base)}</div>
                    <div className="text-xs">{fmtPercent(p.unrealizedPctBase)}</div>
                  </td>
                  <td className="px-4 py-3 text-right num text-[var(--muted)]">
                    {fmtNumber(p.weight, "de-DE", 1)}%
                  </td>
                  {showActions && (
                    <td className="px-2 py-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => onEdit?.(p._id)}
                          className="p-2 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                          title="Position bearbeiten"
                          aria-label={`Position ${p.ticker} bearbeiten`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => onDelete?.(p._id)}
                          className="p-2 text-[var(--muted)] hover:text-[var(--red)] transition-colors"
                          title="Position löschen"
                          aria-label={`Position ${p.ticker} löschen`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PositionCard({
  position: p,
  showActions,
  onEdit,
  onDelete,
  spark,
}: {
  position: EnrichedPosition;
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  spark?: number[];
}) {
  const base = p.baseCurrency;
  const tradingDiffers = p.tradingCurrency !== base;
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/analysis/${encodeURIComponent(p.ticker)}`}
          className="block flex-1 min-w-0"
        >
          <div className="font-semibold flex items-center gap-2">
            <span>{p.ticker}</span>
            {spark && spark.length > 1 && (
              <Sparkline data={spark} width={60} height={18} />
            )}
          </div>
          <div className="text-xs text-[var(--muted)] truncate">{p.name}</div>
        </Link>
        {showActions && (
          <div className="flex gap-0.5 flex-shrink-0 -mr-1">
            <button
              onClick={() => onEdit?.(p._id)}
              className="p-2 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              title="Position bearbeiten"
              aria-label={`Position ${p.ticker} bearbeiten`}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              onClick={() => onDelete?.(p._id)}
              className="p-2 text-[var(--muted)] hover:text-[var(--red)] transition-colors"
              title="Position löschen"
              aria-label={`Position ${p.ticker} löschen`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Wert
          </div>
          <div className="num font-semibold text-base">
            {fmtCurrency(p.marketValueBase, base)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            G/V
          </div>
          <div className={`num font-medium ${changeClass(p.unrealizedPLBase)}`}>
            {fmtCurrency(p.unrealizedPLBase, base)}
          </div>
          <div className={`num text-xs ${changeClass(p.unrealizedPctBase)}`}>
            {fmtPercent(p.unrealizedPctBase)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[var(--border)] text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Anzahl
          </div>
          <div className="num">
            {fmtNumber(p.shares, "de-DE", p.shares % 1 === 0 ? 0 : 2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Ø Kauf
          </div>
          <div className="num">{fmtCurrency(p.avgPriceBase, base)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Aktuell
          </div>
          <div className="num">{fmtCurrency(p.currentPriceBase, base)}</div>
          {tradingDiffers && (
            <div className="num text-[10px] text-[var(--muted)] opacity-60">
              {fmtCurrency(p.currentPrice, p.tradingCurrency)}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Heute
          </div>
          <div className={`num ${changeClass(p.changePercent)}`}>
            {fmtPercent(p.changePercent)}
          </div>
          <div className="num text-[10px] text-[var(--muted)]">
            {fmtNumber(p.weight, "de-DE", 1)}% Gew.
          </div>
        </div>
      </div>
    </div>
  );
}
