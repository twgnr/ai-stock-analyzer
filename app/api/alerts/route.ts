import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PriceAlert } from "@/lib/models/PriceAlert";
import { getCurrentUser } from "@/lib/auth";
import { getQuote } from "@/lib/yahoo";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const alerts = await PriceAlert.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(alerts.map((a) => ({ ...a, _id: String(a._id) })));
}

const VALID_INDICATOR_CONDITIONS = [
  "rsi_below_30",
  "rsi_above_70",
  "macd_bullish_cross",
  "macd_bearish_cross",
  "sma_golden_cross",
  "sma_death_cross",
  "bb_breakout_upper",
  "bb_breakout_lower",
  "price_above_sma200",
  "price_below_sma200",
];

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { ticker, type, direction, threshold, currency, indicatorCondition, notes } = body;
  const alertType: "price" | "indicator" = type === "indicator" ? "indicator" : "price";

  if (!ticker) {
    return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  }
  const normalized = String(ticker).toUpperCase().trim();

  if (alertType === "price") {
    if (!direction || threshold == null) {
      return NextResponse.json(
        { error: "direction und threshold sind Pflicht bei Preis-Alerts" },
        { status: 400 }
      );
    }
    if (!["above", "below"].includes(direction)) {
      return NextResponse.json({ error: t("validation.directionAboveBelow") }, { status: 400 });
    }
    let resolvedCurrency = currency;
    if (!resolvedCurrency) {
      try {
        const q = await getQuote(normalized);
        resolvedCurrency = q.currency;
      } catch {
        resolvedCurrency = "USD";
      }
    }
    const alert = await PriceAlert.create({
      userId: user._id,
      ticker: normalized,
      type: "price",
      direction,
      threshold: Number(threshold),
      currency: resolvedCurrency.toUpperCase(),
      active: true,
      notes,
    });
    return NextResponse.json(
      { ...alert.toObject(), _id: String(alert._id) },
      { status: 201 }
    );
  }

  // Indicator alert
  if (!indicatorCondition || !VALID_INDICATOR_CONDITIONS.includes(indicatorCondition)) {
    return NextResponse.json(
      { error: "Unbekannte Indikator-Bedingung" },
      { status: 400 }
    );
  }
  const alert = await PriceAlert.create({
    userId: user._id,
    ticker: normalized,
    type: "indicator",
    indicatorCondition,
    active: true,
    notes,
  });
  return NextResponse.json(
    { ...alert.toObject(), _id: String(alert._id) },
    { status: 201 }
  );
}
