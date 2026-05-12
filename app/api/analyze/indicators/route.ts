import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote, getChart, type ChartRange } from "@/lib/yahoo";
import {
  analyzeIndicators,
  hasClaudeKey,
  type IndicatorSnapshot,
} from "@/lib/claude";
import {
  computeSMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeAwesomeOscillator,
  computeAroon,
  computeCCI,
  computeMomentum,
  computeOBOS,
  computeDI,
  computeFastStochastic,
  computeIchimoku,
  computeRSL,
  computeAnchoredVWAP,
  computeOBV,
  computeMFI,
  INDICATORS,
  type IndicatorKey,
} from "@/lib/chartIndicators";
import { getApiTranslations } from "@/lib/i18n-server";

const VALID_RANGES: ChartRange[] = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];

function lastValue<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const body = await req.json();
  const ticker = body?.ticker;
  const rangeRaw = body?.range;
  const keys = Array.isArray(body?.indicators) ? (body.indicators as IndicatorKey[]) : [];
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  if (keys.length === 0) {
    return NextResponse.json(
      { error: "Bitte mindestens einen Indikator aktivieren" },
      { status: 400 }
    );
  }

  const range: ChartRange = VALID_RANGES.includes(rangeRaw as ChartRange)
    ? (rangeRaw as ChartRange)
    : "6mo";
  const symbol = String(ticker).toUpperCase();

  try {
    const [quote, candles] = await Promise.all([
      getQuote(symbol),
      getChart(symbol, range, "1d"),
    ]);

    if (candles.length < 30) {
      return NextResponse.json(
        { error: "Zu wenig Chart-Daten für technische Analyse" },
        { status: 400 }
      );
    }

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const last10 = closes.slice(-10);

    const metaByKey = new Map(INDICATORS.map((i) => [i.key, i]));
    const snapshots: IndicatorSnapshot[] = [];

    const push = (key: IndicatorKey, snap: Omit<IndicatorSnapshot, "key" | "label" | "category">) => {
      const meta = metaByKey.get(key);
      if (!meta) return;
      snapshots.push({
        key,
        label: meta.label,
        category: meta.category,
        ...snap,
      });
    };

    for (const k of keys) {
      switch (k) {
        case "SMA20":
        case "SMA50":
        case "SMA200": {
          const period = k === "SMA20" ? 20 : k === "SMA50" ? 50 : 200;
          const sma = computeSMA(closes, period);
          push(k, {
            currentValues: {
              Wert: lastValue(sma) ?? null,
              Distanz_zu_Kurs_Prozent:
                lastValue(sma) != null
                  ? ((quote.price - (lastValue(sma) as number)) / (lastValue(sma) as number)) * 100
                  : null,
            },
            recentSeries: { Werte: sma.slice(-10) },
          });
          break;
        }
        case "BB": {
          const bb = computeBollingerBands(closes);
          const u = lastValue(bb.upper), m = lastValue(bb.middle), l = lastValue(bb.lower);
          push(k, {
            currentValues: {
              Upper: u ?? null,
              Middle: m ?? null,
              Lower: l ?? null,
              Bandwidth_Prozent: u != null && l != null && m ? ((u - l) / m) * 100 : null,
              Percent_B:
                u != null && l != null ? ((quote.price - (l as number)) / ((u as number) - (l as number))) * 100 : null,
            },
            recentSeries: {
              Upper: bb.upper.slice(-10),
              Middle: bb.middle.slice(-10),
              Lower: bb.lower.slice(-10),
            },
            signalRanges: "%B > 100: über oberer Band; %B < 0: unter unterer Band",
          });
          break;
        }
        case "IKH": {
          const ikh = computeIchimoku(highs, lows);
          const t = lastValue(ikh.conv), kj = lastValue(ikh.base), a = lastValue(ikh.spanA), b = lastValue(ikh.spanB);
          push(k, {
            currentValues: {
              Tenkan_9: t ?? null,
              Kijun_26: kj ?? null,
              Senkou_A: a ?? null,
              Senkou_B: b ?? null,
              Kurs_vs_Cloud:
                a != null && b != null
                  ? quote.price > Math.max(a, b)
                    ? 1
                    : quote.price < Math.min(a, b)
                      ? -1
                      : 0
                  : null,
            },
            signalRanges: "Kurs_vs_Cloud = 1: über Cloud (bullish), -1: unter Cloud (bearish), 0: in Cloud (neutral)",
          });
          break;
        }
        case "RSI": {
          const rsi = computeRSI(closes, 14);
          push(k, {
            currentValues: { RSI: lastValue(rsi) ?? null },
            recentSeries: { RSI: rsi.slice(-10) },
            signalRanges: ">70 überkauft, <30 überverkauft",
          });
          break;
        }
        case "MACD": {
          const m = computeMACD(closes);
          push(k, {
            currentValues: {
              MACD: lastValue(m.macd) ?? null,
              Signal: lastValue(m.signal) ?? null,
              Histogramm: lastValue(m.histogram) ?? null,
            },
            recentSeries: {
              Histogramm: m.histogram.slice(-10),
            },
            signalRanges: "Histogramm > 0 und steigend: bullish, < 0 und fallend: bearish",
          });
          break;
        }
        case "AOS": {
          const a = computeAwesomeOscillator(highs, lows);
          push(k, {
            currentValues: { AOS: lastValue(a) ?? null },
            recentSeries: { AOS: a.slice(-10) },
            signalRanges: ">0 und steigend: bullish, <0 und fallend: bearish",
          });
          break;
        }
        case "ARO": {
          const a = computeAroon(highs, lows);
          push(k, {
            currentValues: { Aroon_Osc: lastValue(a) ?? null },
            recentSeries: { Aroon: a.slice(-10) },
            signalRanges: "Range −100 bis +100; > +50 starker Aufwärtstrend, < −50 starker Abwärtstrend",
          });
          break;
        }
        case "CCI": {
          const c = computeCCI(highs, lows, closes);
          push(k, {
            currentValues: { CCI: lastValue(c) ?? null },
            recentSeries: { CCI: c.slice(-10) },
            signalRanges: ">+100 überkauft, <−100 überverkauft",
          });
          break;
        }
        case "MOM": {
          const mm = computeMomentum(closes);
          push(k, {
            currentValues: { Momentum: lastValue(mm) ?? null },
            recentSeries: { Momentum: mm.slice(-10) },
            signalRanges: ">0: Preis liegt über dem vor 10 Perioden, Trendstärke",
          });
          break;
        }
        case "OBOS": {
          const o = computeOBOS(closes);
          push(k, {
            currentValues: { OBOS_Prozent: lastValue(o) ?? null },
            recentSeries: { OBOS: o.slice(-10) },
            signalRanges: "Abweichung vom SMA20 in %; >5%: heißgelaufen, <−5%: oversold",
          });
          break;
        }
        case "DIX": {
          const di = computeDI(highs, lows, closes);
          push(k, {
            currentValues: {
              DI_Plus: lastValue(di.plusDI) ?? null,
              DI_Minus: lastValue(di.minusDI) ?? null,
            },
            recentSeries: {
              DI_Plus: di.plusDI.slice(-10),
              DI_Minus: di.minusDI.slice(-10),
            },
            signalRanges: "DI+ > DI−: Aufwärtstrend, DI+ < DI−: Abwärtstrend",
          });
          break;
        }
        case "FSTOC": {
          const st = computeFastStochastic(highs, lows, closes);
          push(k, {
            currentValues: {
              K_Prozent: lastValue(st.k) ?? null,
              D_Prozent: lastValue(st.d) ?? null,
            },
            recentSeries: {
              K: st.k.slice(-10),
              D: st.d.slice(-10),
            },
            signalRanges: ">80 überkauft, <20 überverkauft, %K über %D = bullish crossover",
          });
          break;
        }
        case "RSL": {
          const r = computeRSL(closes);
          push(k, {
            currentValues: { RSL: lastValue(r) ?? null },
            recentSeries: { RSL: r.slice(-10) },
            signalRanges: ">1 relative Stärke, <1 relative Schwäche (Basis SMA130)",
          });
          break;
        }
        case "MFI": {
          const volumes = candles.map((c) => c.volume);
          const mfi = computeMFI(highs, lows, closes, volumes, 14);
          push(k, {
            currentValues: { MFI: lastValue(mfi) ?? null },
            recentSeries: { MFI: mfi.slice(-10) },
            signalRanges: ">80 überkauft, <20 überverkauft, divergiert vs. RSI bei Volumen-Anomalien",
          });
          break;
        }
        case "OBV": {
          const volumes = candles.map((c) => c.volume);
          const obv = computeOBV(closes, volumes);
          const last = lastValue(obv);
          const thirtyBack = obv[obv.length - 31] ?? null;
          push(k, {
            currentValues: {
              OBV: last ?? null,
              OBV_Trend_30T:
                last != null && thirtyBack != null
                  ? last > thirtyBack
                    ? 1
                    : last < thirtyBack
                      ? -1
                      : 0
                  : null,
            },
            recentSeries: { OBV: obv.slice(-10) },
            signalRanges:
              "Kumulatives signiertes Volumen. +1/−1/0 = Trend der letzten 30 Tage. Divergenz zum Kurs = wichtig.",
          });
          break;
        }
        case "AVWAP": {
          const volumes = candles.map((c) => c.volume);
          const avwap = computeAnchoredVWAP(highs, lows, closes, volumes, 0);
          const last = lastValue(avwap);
          push(k, {
            currentValues: {
              AVWAP: last ?? null,
              Distanz_Kurs_Prozent:
                last != null ? ((quote.price - last) / last) * 100 : null,
            },
            recentSeries: { AVWAP: avwap.slice(-10) },
            signalRanges:
              "VWAP ab Chart-Anfang. Kurs > AVWAP = Institutionelle im Plus; Kurs < AVWAP = im Minus.",
          });
          break;
        }
      }
    }

    const position52W =
      quote.fiftyTwoWeekHigh && quote.fiftyTwoWeekLow && quote.fiftyTwoWeekHigh > quote.fiftyTwoWeekLow
        ? ((quote.price - quote.fiftyTwoWeekLow) /
            (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) *
          100
        : undefined;

    const result = await analyzeIndicators(
      {
        ticker: symbol,
        name: quote.name,
        currentPrice: quote.price,
        currency: quote.currency,
        priceContext: {
          changePercent: quote.changePercent,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          position52W,
          last10Closes: last10,
        },
        indicators: snapshots,
      },
      user
    );

    return NextResponse.json({
      ...result,
      ticker: symbol,
      name: quote.name,
      range,
      indicatorCount: snapshots.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Indikator-Analyse fehlgeschlagen";
    console.error("[indicator-analysis]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
