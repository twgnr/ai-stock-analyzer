import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { PortfolioSnapshot } from "@/lib/models/PortfolioSnapshot";
import { Transaction } from "@/lib/models/Transaction";
import { RealizedGain } from "@/lib/models/RealizedGain";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { analyzePortfolioDelta, hasClaudeKey } from "@/lib/claude";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: tr("ai.noKey") },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const days = typeof body?.days === "number" ? Math.max(7, Math.min(365, body.days)) : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    await connectDB();
    const [currentPositions, txs, realizedGains, oldSnapshot] = await Promise.all([
      Position.find({ userId: user._id }).lean(),
      Transaction.find({ userId: user._id, date: { $gte: since } })
        .sort({ date: 1 })
        .lean(),
      RealizedGain.find({ userId: user._id, saleDate: { $gte: since } }).lean(),
      PortfolioSnapshot.findOne({ userId: user._id, date: { $lte: since } })
        .sort({ date: -1 })
        .lean(),
    ]);

    if (currentPositions.length === 0 && txs.length === 0) {
      return NextResponse.json(
        { error: "Nicht genug Daten für Delta-Analyse" },
        { status: 400 }
      );
    }

    const tickers = currentPositions.map((p) => p.ticker);
    const quotes = await getQuotes(tickers);
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
    const currencies = [
      ...new Set<string>(
        quotes.map((q) => q.currency).concat(currentPositions.map((p) => p.currency))
      ),
    ];
    const fxRates = await getRates(currencies, BASE_CURRENCY);
    const rateFor = (c: string) =>
      c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

    let currentValueBase = 0;
    let currentCostBase = 0;
    const currentByTicker = new Map<string, { shares: number; price: number; name: string }>();
    for (const p of currentPositions) {
      const q = quoteMap.get(p.ticker);
      const price = q?.price ?? p.avgPrice;
      const currency = q?.currency || p.currency;
      currentValueBase += price * p.shares * rateFor(currency);
      currentCostBase += p.avgPrice * p.shares * rateFor(p.currency);
      currentByTicker.set(p.ticker, { shares: p.shares, price, name: q?.name || p.name || p.ticker });
    }

    const previousValueBase = oldSnapshot?.totalValueBase ?? currentValueBase;
    const previousCostBase = oldSnapshot?.totalCostBase ?? currentCostBase;

    const topGainers: Array<{ ticker: string; name: string; pctChange: number }> = [];
    const topLosers: Array<{ ticker: string; name: string; pctChange: number }> = [];
    for (const p of currentPositions) {
      const q = quoteMap.get(p.ticker);
      if (!q) continue;
      const pctChange = p.avgPrice > 0 ? ((q.price - p.avgPrice) / p.avgPrice) * 100 : 0;
      const name = q.name || p.ticker;
      topGainers.push({ ticker: p.ticker, name, pctChange });
      topLosers.push({ ticker: p.ticker, name, pctChange });
    }
    topGainers.sort((a, b) => b.pctChange - a.pctChange);
    topLosers.sort((a, b) => a.pctChange - b.pctChange);

    const newPositions: Array<{
      ticker: string;
      shares: number;
      avgPrice: number;
      currency: string;
    }> = [];
    const closedPositions: Array<{
      ticker: string;
      shares: number;
      price: number;
      currency: string;
    }> = [];
    const seenTickers = new Set<string>();
    for (const tx of txs) {
      if (seenTickers.has(tx.ticker)) continue;
      if (tx.type === "buy") {
        const still = currentByTicker.has(tx.ticker);
        if (still) {
          newPositions.push({
            ticker: tx.ticker,
            shares: tx.shares,
            avgPrice: tx.price,
            currency: tx.currency,
          });
          seenTickers.add(tx.ticker);
        }
      } else if (tx.type === "sell") {
        const still = currentByTicker.has(tx.ticker);
        if (!still) {
          closedPositions.push({
            ticker: tx.ticker,
            shares: tx.shares,
            price: tx.price,
            currency: tx.currency,
          });
          seenTickers.add(tx.ticker);
        }
      }
    }

    const dividends = txs
      .filter((t) => t.type === "dividend" && t.amount && t.amount > 0)
      .map((t) => ({ ticker: t.ticker, amount: t.amount || 0, currency: t.currency }));

    const realizedGainsBase = realizedGains.reduce((s, g) => s + g.gainBase, 0);

    const result = await analyzePortfolioDelta(
      {
        days,
        baseCurrency: BASE_CURRENCY,
        currentValueBase,
        previousValueBase,
        currentCostBase,
        previousCostBase,
        topGainers: topGainers.slice(0, 5),
        topLosers: topLosers.slice(0, 5),
        newPositions,
        closedPositions,
        realizedGainsBase,
        dividendsReceived: dividends,
        transactionCount: txs.length,
      },
      user
    );

    return NextResponse.json({
      ...result,
      metadata: {
        days,
        currentValueBase,
        previousValueBase,
        valueDelta: currentValueBase - previousValueBase,
        valueDeltaPct:
          previousValueBase > 0
            ? ((currentValueBase - previousValueBase) / previousValueBase) * 100
            : 0,
        realizedGainsBase,
        transactionCount: txs.length,
        hasSnapshot: !!oldSnapshot,
        baseCurrency: BASE_CURRENCY,
      },
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Portfolio-Delta-Analyse fehlgeschlagen");
  }
}
