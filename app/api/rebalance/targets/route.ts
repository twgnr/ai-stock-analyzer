import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RebalanceTarget } from "@/lib/models/RebalanceTarget";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const existing = await RebalanceTarget.findOne({ userId: user._id }).lean();
  if (!existing) {
    return NextResponse.json({
      buckets: [],
      thresholdPct: 5,
    });
  }
  return NextResponse.json({
    buckets: existing.buckets,
    thresholdPct: existing.thresholdPct,
  });
}

export async function PUT(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const body = await req.json();

  const bucketsRaw = Array.isArray(body?.buckets) ? body.buckets : [];
  const buckets = bucketsRaw
    .map((b: unknown) => {
      if (typeof b !== "object" || b === null) return null;
      const rec = b as Record<string, unknown>;
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      const tw = Number(rec.targetWeight);
      const tickers = Array.isArray(rec.tickers)
        ? (rec.tickers as unknown[])
            .map((t) => String(t).toUpperCase().trim())
            .filter(Boolean)
        : [];
      if (!label || !Number.isFinite(tw) || tw < 0 || tw > 100) return null;
      return { label, targetWeight: tw, tickers };
    })
    .filter(
      (x: { label: string; targetWeight: number; tickers: string[] } | null): x is {
        label: string;
        targetWeight: number;
        tickers: string[];
      } => x !== null
    );

  const sum = buckets.reduce(
    (s: number, b: { targetWeight: number }) => s + b.targetWeight,
    0
  );
  if (buckets.length > 0 && Math.abs(sum - 100) > 0.5) {
    return NextResponse.json(
      { error: `Summe der Gewichte muss 100 sein, aktuell ${sum.toFixed(1)}` },
      { status: 400 }
    );
  }

  const thresholdPct =
    typeof body?.thresholdPct === "number" && body.thresholdPct >= 0 && body.thresholdPct <= 50
      ? body.thresholdPct
      : 5;

  const updated = await RebalanceTarget.findOneAndUpdate(
    { userId: user._id },
    { $set: { buckets, thresholdPct } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({
    buckets: updated.buckets,
    thresholdPct: updated.thresholdPct,
  });
}
