import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getChart, type ChartRange } from "@/lib/yahoo";
import { runBacktest, STRATEGIES, type StrategyKey } from "@/lib/backtest";
import { getApiTranslations } from "@/lib/i18n-server";

const VALID_RANGES: ChartRange[] = ["3mo", "6mo", "1y", "2y", "5y", "max"];

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ticker = body?.ticker;
  const rangeRaw = body?.range;
  const strategy = body?.strategy as StrategyKey;
  const initialCapital =
    typeof body?.initialCapital === "number" && body.initialCapital > 0
      ? body.initialCapital
      : 10000;

  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  if (!STRATEGIES.some((s) => s.key === strategy)) {
    return NextResponse.json({ error: t("validation.unknownStrategy") }, { status: 400 });
  }

  const range: ChartRange = VALID_RANGES.includes(rangeRaw as ChartRange)
    ? (rangeRaw as ChartRange)
    : "2y";
  const symbol = String(ticker).toUpperCase();

  try {
    const candles = await getChart(symbol, range, "1d");
    if (candles.length < 30) {
      return NextResponse.json(
        { error: "Zu wenig Chart-Daten für Backtest." },
        { status: 400 }
      );
    }

    const result = runBacktest(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
      strategy,
      initialCapital
    );

    return NextResponse.json({
      ...result,
      ticker: symbol,
      range,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backtest-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ strategies: STRATEGIES });
}
