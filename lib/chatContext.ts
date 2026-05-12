import { connectDB } from "./mongodb";
import { Position } from "./models/Position";
import { Transaction } from "./models/Transaction";
import { PortfolioSnapshot } from "./models/PortfolioSnapshot";
import { RealizedGain } from "./models/RealizedGain";
import { Watchlist } from "./models/Watchlist";
import { getQuotes, getFundamentals } from "./yahoo";
import { getRates, BASE_CURRENCY } from "./fx";
import type { Types } from "mongoose";

function regionFromTicker(ticker: string): string {
  const upper = ticker.toUpperCase();
  const dot = upper.indexOf(".");
  if (dot < 0) return "USA";
  const suffix = upper.slice(dot + 1);
  if (suffix === "DE") return "Deutschland";
  if (["AS", "BR", "BE", "PA", "MI", "MC", "L", "SW", "ST", "CO", "OL"].includes(suffix))
    return "Europa";
  if (["T", "HK", "TW", "KS", "KQ", "SI"].includes(suffix)) return "Asien";
  return "Andere";
}

export async function buildPortfolioContextForChat(
  userId: Types.ObjectId | string
): Promise<string> {
  await connectDB();
  const positions = await Position.find({ userId }).lean();

  if (positions.length === 0) {
    return "Der Nutzer hat aktuell KEINE Positionen im Portfolio.";
  }

  const tickers = positions.map((p) => p.ticker);
  const [quotes, fundamentalsList] = await Promise.all([
    getQuotes(tickers),
    Promise.all(tickers.map((t) => getFundamentals(t).catch(() => null))),
  ]);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
  const sectorMap = new Map<string, string | undefined>();
  tickers.forEach((t, i) => sectorMap.set(t, fundamentalsList[i]?.sector));

  const currencies = [
    ...new Set<string>(quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))),
  ];
  const fxRates = await getRates(currencies, BASE_CURRENCY);
  const rateFor = (c: string) =>
    c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

  let totalValueBase = 0;
  let totalCostBase = 0;
  const enriched = positions.map((p) => {
    const q = quoteMap.get(p.ticker);
    const price = q?.price ?? p.avgPrice;
    const currency = q?.currency || p.currency;
    const marketValue = price * p.shares * rateFor(currency);
    const cost = p.avgPrice * p.shares * rateFor(p.currency);
    totalValueBase += marketValue;
    totalCostBase += cost;
    return {
      ticker: p.ticker,
      name: q?.name || p.name || p.ticker,
      shares: p.shares,
      avgPrice: p.avgPrice,
      currentPrice: price,
      currency,
      purchaseCurrency: p.currency,
      marketValueBase: marketValue,
      costBase: cost,
      plBase: marketValue - cost,
      plPct: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
      changePct: q?.changePercent ?? 0,
      sector: sectorMap.get(p.ticker) || "Unbekannt",
      region: regionFromTicker(p.ticker),
    };
  });

  enriched.sort((a, b) => b.marketValueBase - a.marketValueBase);

  const totalPL = totalValueBase - totalCostBase;
  const totalPLPct = totalCostBase > 0 ? (totalPL / totalCostBase) * 100 : 0;

  const sectorBuckets = new Map<string, number>();
  const regionBuckets = new Map<string, number>();
  for (const e of enriched) {
    sectorBuckets.set(e.sector, (sectorBuckets.get(e.sector) || 0) + e.marketValueBase);
    regionBuckets.set(e.region, (regionBuckets.get(e.region) || 0) + e.marketValueBase);
  }
  const sectors = [...sectorBuckets.entries()]
    .map(([label, v]) => ({ label, pct: (v / totalValueBase) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const regions = [...regionBuckets.entries()]
    .map(([label, v]) => ({ label, pct: (v / totalValueBase) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [recentTransactions, realizedYTD, oldSnapshot, watchlist] = await Promise.all([
    Transaction.find({ userId, date: { $gte: thirtyDaysAgo } })
      .sort({ date: -1 })
      .limit(15)
      .lean(),
    RealizedGain.aggregate([
      { $match: { userId, saleDate: { $gte: yearStart } } },
      { $group: { _id: null, total: { $sum: "$gainBase" } } },
    ]),
    PortfolioSnapshot.findOne({ userId, date: { $lte: thirtyDaysAgo } })
      .sort({ date: -1 })
      .lean(),
    Watchlist.find({ userId }).select("ticker").lean(),
  ]);

  const realizedYTDBase = realizedYTD[0]?.total || 0;
  const monthlyChange = oldSnapshot
    ? totalValueBase - oldSnapshot.totalValueBase
    : null;
  const monthlyChangePct =
    oldSnapshot && oldSnapshot.totalValueBase > 0
      ? (monthlyChange! / oldSnapshot.totalValueBase) * 100
      : null;

  const lines: string[] = [
    `Basis-Währung: ${BASE_CURRENCY}`,
    `Portfolio-Gesamtwert: ${totalValueBase.toFixed(0)} ${BASE_CURRENCY}`,
    `Eingesetzt (Cost Basis): ${totalCostBase.toFixed(0)} ${BASE_CURRENCY}`,
    `Gesamt G/V: ${totalPL >= 0 ? "+" : ""}${totalPL.toFixed(0)} ${BASE_CURRENCY} (${totalPLPct >= 0 ? "+" : ""}${totalPLPct.toFixed(2)}%)`,
  ];
  if (monthlyChange !== null) {
    lines.push(
      `Entwicklung letzte 30 Tage: ${monthlyChange >= 0 ? "+" : ""}${monthlyChange.toFixed(0)} ${BASE_CURRENCY} (${monthlyChangePct! >= 0 ? "+" : ""}${monthlyChangePct!.toFixed(2)}%)`
    );
  }
  lines.push(`Realisierte Gewinne YTD: ${realizedYTDBase.toFixed(0)} ${BASE_CURRENCY}`);
  lines.push(`Anzahl Positionen: ${positions.length}`);

  lines.push("", "=== POSITIONEN (sortiert nach Gewicht) ===");
  for (const e of enriched) {
    const weight = (e.marketValueBase / totalValueBase) * 100;
    lines.push(
      `${e.ticker} (${e.name}): ${e.shares} Aktien @ Ø ${e.avgPrice.toFixed(2)} ${e.purchaseCurrency} | aktuell ${e.currentPrice.toFixed(2)} ${e.currency} | Wert ${e.marketValueBase.toFixed(0)} ${BASE_CURRENCY} (${weight.toFixed(1)}%) | G/V ${e.plBase >= 0 ? "+" : ""}${e.plBase.toFixed(0)} ${BASE_CURRENCY} (${e.plPct >= 0 ? "+" : ""}${e.plPct.toFixed(1)}%) | Heute ${e.changePct >= 0 ? "+" : ""}${e.changePct.toFixed(2)}% | Sektor: ${e.sector} | Region: ${e.region}`
    );
  }

  lines.push("", "=== SEKTOREN ===");
  sectors.forEach((s) => lines.push(`${s.label}: ${s.pct.toFixed(1)}%`));
  lines.push("", "=== REGIONEN ===");
  regions.forEach((r) => lines.push(`${r.label}: ${r.pct.toFixed(1)}%`));

  if (recentTransactions.length > 0) {
    lines.push("", "=== TRANSAKTIONEN LETZTE 30 TAGE ===");
    for (const tx of recentTransactions.slice(0, 10)) {
      const date = new Date(tx.date).toISOString().slice(0, 10);
      const detail =
        tx.type === "dividend" || tx.type === "fee"
          ? `${tx.amount?.toFixed(2)} ${tx.currency}`
          : `${tx.shares} @ ${tx.price.toFixed(2)} ${tx.currency}`;
      lines.push(`[${date}] ${tx.type.toUpperCase()} ${tx.ticker}: ${detail}`);
    }
  }

  if (watchlist.length > 0) {
    lines.push("", `=== WATCHLIST ===`);
    lines.push(watchlist.map((w) => w.ticker).join(", "));
  }

  return lines.join("\n");
}
