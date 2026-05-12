import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PortfolioSnapshot } from "@/lib/models/PortfolioSnapshot";
import { Transaction } from "@/lib/models/Transaction";
import { getCurrentUser } from "@/lib/auth";
import { computePortfolioMetrics, type FlowPoint } from "@/lib/portfolioMetrics";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const rfRaw = req.nextUrl.searchParams.get("rf");
  const rf = rfRaw != null ? Number(rfRaw) / 100 : 0;

  const snapshots = await PortfolioSnapshot.find({ userId: user._id })
    .sort({ date: 1 })
    .lean();
  if (snapshots.length < 2) {
    return NextResponse.json({
      metrics: null,
      reason:
        "Mindestens 2 tägliche Portfolio-Snapshots nötig — kommen automatisch um 23:55 UTC. Am ersten Tag noch nicht da.",
    });
  }

  // Flows aus Transaktionen (buy = Einzahlung, sell = Auszahlung) auf BASE_CURRENCY umrechnen
  const txs = await Transaction.find({
    userId: user._id,
    type: { $in: ["buy", "sell"] },
    date: { $gte: snapshots[0].date },
  }).lean();

  const currencies = [...new Set(txs.map((t) => t.currency))];
  const rates = currencies.length > 0 ? await getRates(currencies, BASE_CURRENCY) : {};
  const rateFor = (c: string) =>
    c.toUpperCase() === BASE_CURRENCY ? 1 : rates[c.toUpperCase()] ?? 0;

  const flows: FlowPoint[] = txs.map((t) => {
    const notional = (t.shares || 0) * (t.price || 0);
    const signed = t.type === "buy" ? +notional : -notional;
    return {
      date: new Date(t.date),
      amountBase: signed * rateFor(t.currency),
    };
  });

  const metrics = computePortfolioMetrics(
    snapshots.map((s) => ({
      date: new Date(s.date),
      totalValueBase: s.totalValueBase,
      totalCostBase: s.totalCostBase,
    })),
    flows,
    rf
  );

  return NextResponse.json({
    metrics,
    baseCurrency: BASE_CURRENCY,
    riskFreeRatePct: rf * 100,
  });
}
