import { NextRequest, NextResponse } from "next/server";
import { getChart, ChartRange, ChartInterval } from "@/lib/yahoo";

type Params = { params: Promise<{ ticker: string }> };

const VALID_RANGES: ChartRange[] = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];
const VALID_INTERVALS: ChartInterval[] = ["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"];

export async function GET(req: NextRequest, { params }: Params) {
  const { ticker } = await params;
  const sp = req.nextUrl.searchParams;
  const rangeRaw = sp.get("range") || "6mo";
  const intervalRaw = sp.get("interval") || "1d";

  const range = VALID_RANGES.includes(rangeRaw as ChartRange) ? (rangeRaw as ChartRange) : "6mo";
  const interval = VALID_INTERVALS.includes(intervalRaw as ChartInterval)
    ? (intervalRaw as ChartInterval)
    : "1d";

  try {
    const candles = await getChart(ticker, range, interval);
    return NextResponse.json(candles);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fehler beim Chart-Abruf";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
