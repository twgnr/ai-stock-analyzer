import { connectDB } from "./mongodb";
import { PriceAlert } from "./models/PriceAlert";
import { User } from "./models/User";
import { getQuotes, getChart, type Candle } from "./yahoo";
import { sendMail } from "./email";
import { fmtCurrency } from "./format";
import { sendPushToUser } from "./webPush";
import { getEmailTranslations } from "./i18n-server";
import {
  computeRSI,
  computeMACD,
  computeSMA,
  computeBollingerBands,
} from "./chartIndicators";

function crossedDown(curr: number, prev: number, level: number): boolean {
  return prev >= level && curr < level;
}
function crossedUp(curr: number, prev: number, level: number): boolean {
  return prev <= level && curr > level;
}

function lastTwo(arr: Array<number | null>): [number, number] | null {
  if (arr.length < 2) return null;
  const cur = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  if (cur == null || prev == null) return null;
  return [cur, prev];
}

export function evaluateIndicatorCondition(
  candles: Candle[],
  condition: string
): boolean {
  const closes = candles.map((c) => c.close);
  if (closes.length < 50) return false;

  switch (condition) {
    case "rsi_below_30": {
      const rsi = computeRSI(closes, 14);
      const pair = lastTwo(rsi);
      if (!pair) return false;
      return crossedDown(pair[0], pair[1], 30);
    }
    case "rsi_above_70": {
      const rsi = computeRSI(closes, 14);
      const pair = lastTwo(rsi);
      if (!pair) return false;
      return crossedUp(pair[0], pair[1], 70);
    }
    case "macd_bullish_cross": {
      const m = computeMACD(closes);
      const cur = m.macd[m.macd.length - 1];
      const prev = m.macd[m.macd.length - 2];
      const curS = m.signal[m.signal.length - 1];
      const prevS = m.signal[m.signal.length - 2];
      if (cur == null || prev == null || curS == null || prevS == null) return false;
      return prev <= prevS && cur > curS;
    }
    case "macd_bearish_cross": {
      const m = computeMACD(closes);
      const cur = m.macd[m.macd.length - 1];
      const prev = m.macd[m.macd.length - 2];
      const curS = m.signal[m.signal.length - 1];
      const prevS = m.signal[m.signal.length - 2];
      if (cur == null || prev == null || curS == null || prevS == null) return false;
      return prev >= prevS && cur < curS;
    }
    case "sma_golden_cross": {
      if (closes.length < 200) return false;
      const sma50 = computeSMA(closes, 50);
      const sma200 = computeSMA(closes, 200);
      const cur50 = sma50[sma50.length - 1];
      const prev50 = sma50[sma50.length - 2];
      const cur200 = sma200[sma200.length - 1];
      const prev200 = sma200[sma200.length - 2];
      if (cur50 == null || prev50 == null || cur200 == null || prev200 == null)
        return false;
      return prev50 <= prev200 && cur50 > cur200;
    }
    case "sma_death_cross": {
      if (closes.length < 200) return false;
      const sma50 = computeSMA(closes, 50);
      const sma200 = computeSMA(closes, 200);
      const cur50 = sma50[sma50.length - 1];
      const prev50 = sma50[sma50.length - 2];
      const cur200 = sma200[sma200.length - 1];
      const prev200 = sma200[sma200.length - 2];
      if (cur50 == null || prev50 == null || cur200 == null || prev200 == null)
        return false;
      return prev50 >= prev200 && cur50 < cur200;
    }
    case "bb_breakout_upper": {
      const bb = computeBollingerBands(closes);
      const upCur = bb.upper[bb.upper.length - 1];
      const upPrev = bb.upper[bb.upper.length - 2];
      const curClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      if (upCur == null || upPrev == null) return false;
      return prevClose <= upPrev && curClose > upCur;
    }
    case "bb_breakout_lower": {
      const bb = computeBollingerBands(closes);
      const loCur = bb.lower[bb.lower.length - 1];
      const loPrev = bb.lower[bb.lower.length - 2];
      const curClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      if (loCur == null || loPrev == null) return false;
      return prevClose >= loPrev && curClose < loCur;
    }
    case "price_above_sma200": {
      if (closes.length < 200) return false;
      const sma = computeSMA(closes, 200);
      const curSMA = sma[sma.length - 1];
      const prevSMA = sma[sma.length - 2];
      const curClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      if (curSMA == null || prevSMA == null) return false;
      return prevClose <= prevSMA && curClose > curSMA;
    }
    case "price_below_sma200": {
      if (closes.length < 200) return false;
      const sma = computeSMA(closes, 200);
      const curSMA = sma[sma.length - 1];
      const prevSMA = sma[sma.length - 2];
      const curClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      if (curSMA == null || prevSMA == null) return false;
      return prevClose >= prevSMA && curClose < curSMA;
    }
    default:
      return false;
  }
}

const INDICATOR_LABELS: Record<string, string> = {
  rsi_below_30: "RSI-Oversold (< 30)",
  rsi_above_70: "RSI-Overbought (> 70)",
  macd_bullish_cross: "MACD bullish crossover",
  macd_bearish_cross: "MACD bearish crossover",
  sma_golden_cross: "Golden Cross (SMA 50/200)",
  sma_death_cross: "Death Cross (SMA 50/200)",
  bb_breakout_upper: "Bollinger-Breakout nach oben",
  bb_breakout_lower: "Bollinger-Breakout nach unten",
  price_above_sma200: "Kurs kreuzt über SMA 200",
  price_below_sma200: "Kurs kreuzt unter SMA 200",
};

export function indicatorConditionLabel(c: string): string {
  return INDICATOR_LABELS[c] || c;
}

export const INDICATOR_CONDITIONS = Object.entries(INDICATOR_LABELS).map(
  ([key, label]) => ({ key, label })
);

export async function checkAlerts(): Promise<{ checked: number; triggered: number }> {
  await connectDB();
  const alerts = await PriceAlert.find({
    active: true,
    triggeredAt: { $exists: false },
  }).lean();
  if (alerts.length === 0) return { checked: 0, triggered: 0 };

  const priceAlerts = alerts.filter((a) => (a.type || "price") === "price");
  const indicatorAlerts = alerts.filter((a) => a.type === "indicator");

  const allTickers = [...new Set(alerts.map((a) => a.ticker))];
  const quotes = await getQuotes(allTickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  const chartCache = new Map<string, Candle[]>();
  async function getChartCached(ticker: string): Promise<Candle[]> {
    if (chartCache.has(ticker)) return chartCache.get(ticker)!;
    try {
      const c = await getChart(ticker, "1y", "1d");
      chartCache.set(ticker, c);
      return c;
    } catch {
      chartCache.set(ticker, []);
      return [];
    }
  }

  let triggered = 0;
  const byUser = new Map<
    string,
    Array<{
      alert: (typeof alerts)[number];
      currentPrice?: number;
      currency?: string;
      conditionLabel?: string;
    }>
  >();

  for (const alert of priceAlerts) {
    const q = quoteMap.get(alert.ticker);
    if (!q || alert.threshold == null || !alert.direction) continue;
    const hit =
      (alert.direction === "above" && q.price >= alert.threshold) ||
      (alert.direction === "below" && q.price <= alert.threshold);
    if (!hit) continue;
    triggered += 1;
    await PriceAlert.updateOne(
      { _id: alert._id },
      { $set: { triggeredAt: new Date(), active: false } }
    );
    const list = byUser.get(String(alert.userId)) || [];
    list.push({ alert, currentPrice: q.price, currency: q.currency });
    byUser.set(String(alert.userId), list);
  }

  for (const alert of indicatorAlerts) {
    if (!alert.indicatorCondition) continue;
    const candles = await getChartCached(alert.ticker);
    if (candles.length < 20) continue;
    const hit = evaluateIndicatorCondition(candles, alert.indicatorCondition);
    if (!hit) continue;
    triggered += 1;
    await PriceAlert.updateOne(
      { _id: alert._id },
      { $set: { triggeredAt: new Date(), active: false } }
    );
    const q = quoteMap.get(alert.ticker);
    const list = byUser.get(String(alert.userId)) || [];
    list.push({
      alert,
      currentPrice: q?.price,
      currency: q?.currency,
      conditionLabel: indicatorConditionLabel(alert.indicatorCondition),
    });
    byUser.set(String(alert.userId), list);
  }

  for (const [userId, userAlerts] of byUser) {
    const user = await User.findById(userId)
      .select("email notificationEmail alertsEnabled locale")
      .lean();
    if (!user || !user.alertsEnabled) continue;
    const recipient = user.notificationEmail || user.email;
    const tMail = await getEmailTranslations(user.locale);
    const lines = userAlerts.map(({ alert, currentPrice, currency, conditionLabel }) => {
      const price =
        currentPrice != null && currency
          ? fmtCurrency(currentPrice, currency)
          : "?";
      if (alert.type === "indicator") {
        return tMail("alert.lineIndicator", {
          ticker: alert.ticker,
          condition: conditionLabel || alert.indicatorCondition || "",
          price,
        });
      }
      const threshold =
        alert.threshold != null && alert.currency
          ? fmtCurrency(alert.threshold, alert.currency)
          : "?";
      const key = alert.direction === "above" ? "alert.linePriceAbove" : "alert.linePriceBelow";
      return tMail(key, { ticker: alert.ticker, price, threshold });
    });
    const text = [
      tMail("alert.greeting"),
      "",
      tMail("alert.intro"),
      "",
      lines.join("\n"),
      "",
      tMail("alert.footer", { url: process.env.APP_URL || "http://localhost:3000" }),
      "",
      tMail("common.signature"),
    ].join("\n");
    const subject =
      userAlerts.length === 1
        ? tMail("alert.subjectSingular")
        : tMail("alert.subjectPlural", { count: userAlerts.length });
    await sendMail({
      to: recipient,
      subject,
      text,
    });

    // Web-Push parallel zur Mail. Wenn Push nicht konfiguriert oder
    // Subscriptions fehlen, ist sendPushToUser ein No-Op.
    const headline =
      userAlerts.length === 1
        ? `${userAlerts[0].alert.ticker}: Alert ausgelöst`
        : `${userAlerts.length} Alerts ausgelöst`;
    const pushBody = lines
      .map((l) => l.replace(/^•\s*/, ""))
      .slice(0, 3)
      .join("\n");
    const targetUrl = userAlerts.length === 1
      ? `/analysis/${encodeURIComponent(userAlerts[0].alert.ticker)}`
      : "/alerts/history";
    sendPushToUser(userId, {
      title: headline,
      body: pushBody,
      url: targetUrl,
      tag: `alerts-${userId}`,
    }).catch((e) => console.error("[push/alerts]", e instanceof Error ? e.message : e));
  }

  return { checked: alerts.length, triggered };
}
