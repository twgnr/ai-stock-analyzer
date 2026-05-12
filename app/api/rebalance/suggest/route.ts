import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { RebalanceTarget } from "@/lib/models/RebalanceTarget";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { getApiTranslations } from "@/lib/i18n-server";

interface BucketEval {
  label: string;
  targetWeight: number;
  currentWeight: number;
  currentValueBase: number;
  targetValueBase: number;
  deltaBase: number;
  deltaPct: number;
  action: "buy" | "sell" | "hold";
  tickers: string[];
  tickerDetails: Array<{ ticker: string; valueBase: number }>;
}

export async function GET() {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const [target, positions] = await Promise.all([
    RebalanceTarget.findOne({ userId: user._id }).lean(),
    Position.find({ userId: user._id }).lean(),
  ]);

  if (!target || target.buckets.length === 0) {
    return NextResponse.json({
      error: "Keine Target-Allocation konfiguriert.",
      buckets: [],
      totalValueBase: 0,
      baseCurrency: BASE_CURRENCY,
    });
  }

  if (positions.length === 0) {
    return NextResponse.json({
      buckets: target.buckets.map((b) => ({
        label: b.label,
        targetWeight: b.targetWeight,
        currentWeight: 0,
        currentValueBase: 0,
        targetValueBase: 0,
        deltaBase: 0,
        deltaPct: b.targetWeight,
        action: "buy" as const,
        tickers: b.tickers,
        tickerDetails: [],
      })),
      totalValueBase: 0,
      baseCurrency: BASE_CURRENCY,
      thresholdPct: target.thresholdPct,
    });
  }

  const tickers = positions.map((p) => p.ticker);
  const quotes = await getQuotes(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  const currencies = [
    ...new Set<string>(
      quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))
    ),
  ];
  const fxRates = await getRates(currencies, BASE_CURRENCY);
  const rateFor = (c: string) =>
    c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

  const positionValue = new Map<string, number>();
  let totalValueBase = 0;
  for (const p of positions) {
    const q = quoteMap.get(p.ticker);
    const price = q?.price ?? p.avgPrice;
    const currency = q?.currency || p.currency;
    const val = price * p.shares * rateFor(currency);
    positionValue.set(p.ticker, (positionValue.get(p.ticker) || 0) + val);
    totalValueBase += val;
  }

  const assignedTickers = new Set<string>();
  const buckets: BucketEval[] = target.buckets.map((b) => {
    const tickerDetails: Array<{ ticker: string; valueBase: number }> = [];
    let currentValueBase = 0;
    for (const t of b.tickers) {
      const tu = t.toUpperCase();
      const v = positionValue.get(tu) || 0;
      currentValueBase += v;
      assignedTickers.add(tu);
      if (v > 0) tickerDetails.push({ ticker: tu, valueBase: v });
    }
    const currentWeight =
      totalValueBase > 0 ? (currentValueBase / totalValueBase) * 100 : 0;
    const targetValueBase = (b.targetWeight / 100) * totalValueBase;
    const deltaBase = targetValueBase - currentValueBase;
    const deltaPct = b.targetWeight - currentWeight;
    const action: "buy" | "sell" | "hold" =
      Math.abs(deltaPct) < target.thresholdPct
        ? "hold"
        : deltaBase > 0
          ? "buy"
          : "sell";
    return {
      label: b.label,
      targetWeight: b.targetWeight,
      currentWeight,
      currentValueBase,
      targetValueBase,
      deltaBase,
      deltaPct,
      action,
      tickers: b.tickers,
      tickerDetails: tickerDetails.sort((a, b) => b.valueBase - a.valueBase),
    };
  });

  const unassigned: Array<{ ticker: string; valueBase: number }> = [];
  for (const [ticker, val] of positionValue.entries()) {
    if (!assignedTickers.has(ticker)) {
      unassigned.push({ ticker, valueBase: val });
    }
  }
  unassigned.sort((a, b) => b.valueBase - a.valueBase);

  return NextResponse.json({
    buckets,
    totalValueBase,
    baseCurrency: BASE_CURRENCY,
    thresholdPct: target.thresholdPct,
    unassigned,
  });
}
