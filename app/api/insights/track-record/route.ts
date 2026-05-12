import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Analysis, type Recommendation } from "@/lib/models/Analysis";
import { getChart, getQuote } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

interface Outcome {
  ticker: string;
  name?: string;
  recommendation: Recommendation;
  confidence?: number;
  model: string;
  createdAt: string;
  /** Schlusskurs am ersten Handelstag >= createdAt. */
  originPrice: number;
  /** Aktueller Preis (heutiger Tag). */
  currentPrice: number;
  returnPct: number;
  daysHeld: number;
  /** „hit" wenn die Empfehlung eingetroffen ist (siehe Logik unten). */
  hit: boolean | null;
}

interface AggregateBucket {
  total: number;
  hits: number;
  hitRatePct: number;
  avgReturnPct: number;
}

interface TrackRecordResponse {
  totalAnalyses: number;
  evaluatable: number;
  overall: AggregateBucket;
  byRecommendation: Record<Recommendation, AggregateBucket>;
  byModel: Record<string, AggregateBucket>;
  outcomes: Outcome[];
}

const HOLD_NEUTRAL_BAND_PCT = 5;
const MIN_HOLD_DAYS = 7;
const MAX_OUTCOMES = 100;

function evaluateHit(rec: Recommendation, returnPct: number): boolean | null {
  switch (rec) {
    case "BUY":
    case "ACCUMULATE":
      return returnPct > 0;
    case "SELL":
    case "REDUCE":
      return returnPct < 0;
    case "HOLD":
      return Math.abs(returnPct) <= HOLD_NEUTRAL_BAND_PCT;
    default:
      return null;
  }
}

function emptyBucket(): AggregateBucket {
  return { total: 0, hits: 0, hitRatePct: 0, avgReturnPct: 0 };
}

function pushToBucket(bucket: AggregateBucket, outcome: Outcome) {
  bucket.total += 1;
  if (outcome.hit) bucket.hits += 1;
  bucket.avgReturnPct =
    (bucket.avgReturnPct * (bucket.total - 1) + outcome.returnPct) / bucket.total;
}

function finalizeBucket(b: AggregateBucket): void {
  b.hitRatePct = b.total > 0 ? (b.hits / b.total) * 100 : 0;
}

/** Findet den ersten Close-Preis im Chart, dessen Datum >= refDate liegt. */
function findOriginClose(candles: { time: number; close: number }[], refDate: Date): number | null {
  const refTs = Math.floor(refDate.getTime() / 1000);
  for (const c of candles) {
    if (c.time >= refTs) return c.close;
  }
  // Fallback: letzter verfügbarer Close, falls refDate >= alle Candles (sollte nicht passieren).
  return candles.length > 0 ? candles[candles.length - 1].close : null;
}

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  await connectDB();

  // Hole alle einzelnen Stock-Analysen mit Recommendation, mindestens
  // MIN_HOLD_DAYS alt (sonst noch nicht aussagekräftig).
  const cutoff = new Date(Date.now() - MIN_HOLD_DAYS * 24 * 3600 * 1000);
  const analyses = await Analysis.find({
    kind: "single",
    recommendation: { $exists: true, $ne: null },
    createdAt: { $lte: cutoff },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_OUTCOMES * 3) // bisschen Headroom — manche Analysen werden ggf. übersprungen
    .lean();

  if (analyses.length === 0) {
    const empty: TrackRecordResponse = {
      totalAnalyses: 0,
      evaluatable: 0,
      overall: emptyBucket(),
      byRecommendation: {} as TrackRecordResponse["byRecommendation"],
      byModel: {},
      outcomes: [],
    };
    return NextResponse.json(empty);
  }

  // Pro Ticker einen Chart-Call (statt einen pro Analyse). Range so groß wie
  // die älteste Analyse + Puffer.
  const oldest = analyses[analyses.length - 1].createdAt;
  const ageDays = (Date.now() - new Date(oldest).getTime()) / (24 * 3600 * 1000);
  const range =
    ageDays > 365 ? "2y" : ageDays > 180 ? "1y" : ageDays > 90 ? "6mo" : "3mo";

  const tickers = Array.from(new Set(analyses.map((a) => a.ticker.toUpperCase())));
  const chartByTicker = new Map<string, { time: number; close: number }[]>();
  const quoteByTicker = new Map<string, { price: number; name?: string }>();

  await Promise.allSettled(
    tickers.map(async (t) => {
      try {
        const candles = await getChart(t, range, "1d");
        chartByTicker.set(
          t,
          candles.map((c) => ({ time: c.time, close: c.close }))
        );
      } catch {
        // Ticker hat keinen Chart mehr → wird übersprungen.
      }
      try {
        const q = await getQuote(t);
        quoteByTicker.set(t, { price: q.price, name: q.name });
      } catch {
        // Quote nicht abrufbar → ohne aktuellen Preis nicht evaluierbar.
      }
    })
  );

  const outcomes: Outcome[] = [];
  for (const a of analyses) {
    if (outcomes.length >= MAX_OUTCOMES) break;
    const tk = a.ticker.toUpperCase();
    const candles = chartByTicker.get(tk);
    const quote = quoteByTicker.get(tk);
    if (!candles || !quote || !a.recommendation) continue;
    const originPrice = findOriginClose(candles, new Date(a.createdAt));
    if (originPrice == null || originPrice <= 0) continue;
    const returnPct = ((quote.price - originPrice) / originPrice) * 100;
    const daysHeld = Math.max(
      1,
      Math.round((Date.now() - new Date(a.createdAt).getTime()) / (24 * 3600 * 1000))
    );
    const hit = evaluateHit(a.recommendation, returnPct);
    outcomes.push({
      ticker: tk,
      name: quote.name,
      recommendation: a.recommendation,
      confidence: a.confidence,
      model: a.model,
      createdAt: new Date(a.createdAt).toISOString(),
      originPrice,
      currentPrice: quote.price,
      returnPct,
      daysHeld,
      hit,
    });
  }

  const overall = emptyBucket();
  const byRecommendation = {} as TrackRecordResponse["byRecommendation"];
  const byModel: Record<string, AggregateBucket> = {};
  for (const o of outcomes) {
    if (o.hit === null) continue;
    pushToBucket(overall, o);
    const recBucket = byRecommendation[o.recommendation] ?? emptyBucket();
    pushToBucket(recBucket, o);
    byRecommendation[o.recommendation] = recBucket;
    const m = o.model;
    const mBucket = byModel[m] ?? emptyBucket();
    pushToBucket(mBucket, o);
    byModel[m] = mBucket;
  }
  finalizeBucket(overall);
  for (const k of Object.keys(byRecommendation) as Recommendation[]) {
    finalizeBucket(byRecommendation[k]);
  }
  for (const k of Object.keys(byModel)) {
    finalizeBucket(byModel[k]);
  }

  const response: TrackRecordResponse = {
    totalAnalyses: analyses.length,
    evaluatable: outcomes.length,
    overall,
    byRecommendation,
    byModel,
    outcomes,
  };
  return NextResponse.json(response);
}
