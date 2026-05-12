import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getCurrentUser } from "@/lib/auth";
import { getChart } from "@/lib/yahoo";
import {
  alignLast,
  beta,
  correlation,
  returnsFromCloses,
  stddev,
} from "@/lib/stats";
import { getApiTranslations } from "@/lib/i18n-server";

interface Pair {
  a: string;
  b: string;
  r: number;
}

interface PerTicker {
  ticker: string;
  name?: string;
  beta: number;
  volatility: number;
  avgCorrelation: number;
  dataPoints: number;
}

export async function GET(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const benchmark = (req.nextUrl.searchParams.get("benchmark") || "^GSPC").toUpperCase();
  const rangeRaw = req.nextUrl.searchParams.get("range") || "6mo";
  const range = ["3mo", "6mo", "1y", "2y"].includes(rangeRaw)
    ? (rangeRaw as "3mo" | "6mo" | "1y" | "2y")
    : "6mo";

  const positions = await Position.find({ userId: user._id }).lean();
  if (positions.length === 0) {
    return NextResponse.json({
      tickers: [],
      matrix: [],
      pairs: [],
      perTicker: [],
      benchmark,
      range,
      warnings: ["Keine Positionen im Portfolio."],
    });
  }

  const tickers = [...new Set(positions.map((p) => p.ticker.toUpperCase()))];
  const warnings: string[] = [];

  const chartPromises = tickers.map(async (t) => {
    try {
      const c = await getChart(t, range, "1d");
      return [t, c.map((x) => x.close)] as const;
    } catch {
      warnings.push(`${t}: Chart konnte nicht geladen werden`);
      return [t, [] as number[]] as const;
    }
  });
  let benchmarkCloses: number[] = [];
  try {
    const bc = await getChart(benchmark, range, "1d");
    benchmarkCloses = bc.map((x) => x.close);
  } catch {
    warnings.push(`Benchmark ${benchmark}: Chart-Daten nicht verfügbar`);
  }
  const chartData = await Promise.all(chartPromises);
  const closesMap = new Map(chartData);

  const returnsMap = new Map<string, number[]>();
  for (const [t, closes] of closesMap) {
    if (closes.length < 20) continue;
    returnsMap.set(t, returnsFromCloses(closes));
  }
  const benchmarkReturns = returnsFromCloses(benchmarkCloses);

  const validTickers = tickers.filter((t) => returnsMap.has(t));

  const matrix: number[][] = validTickers.map((a) =>
    validTickers.map((b) => {
      if (a === b) return 1;
      const [ra, rb] = alignLast(returnsMap.get(a)!, returnsMap.get(b)!);
      if (ra.length < 10) return 0;
      return correlation(ra, rb);
    })
  );

  const pairs: Pair[] = [];
  for (let i = 0; i < validTickers.length; i++) {
    for (let j = i + 1; j < validTickers.length; j++) {
      pairs.push({
        a: validTickers[i],
        b: validTickers[j],
        r: matrix[i][j],
      });
    }
  }
  pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  const perTicker: PerTicker[] = validTickers.map((t) => {
    const rets = returnsMap.get(t)!;
    const vola = stddev(rets) * Math.sqrt(252);
    let b = 0;
    let dp = rets.length;
    if (benchmarkReturns.length > 10) {
      const [ra, rb] = alignLast(rets, benchmarkReturns);
      b = beta(ra, rb);
      dp = ra.length;
    }
    const idx = validTickers.indexOf(t);
    const corrs = matrix[idx].filter((_, j) => j !== idx);
    const avgCorr =
      corrs.length > 0 ? corrs.reduce((s, x) => s + x, 0) / corrs.length : 0;
    return {
      ticker: t,
      name: positions.find((p) => p.ticker.toUpperCase() === t)?.name,
      beta: b,
      volatility: vola,
      avgCorrelation: avgCorr,
      dataPoints: dp,
    };
  });

  for (const t of tickers) {
    if (!returnsMap.has(t)) warnings.push(`${t}: Zu wenig Daten für Statistik`);
  }

  return NextResponse.json({
    tickers: validTickers,
    matrix,
    pairs,
    perTicker,
    benchmark,
    range,
    warnings,
  });
}
