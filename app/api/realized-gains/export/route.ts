import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RealizedGain } from "@/lib/models/RealizedGain";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const year = req.nextUrl.searchParams.get("year");
  const filter: Record<string, unknown> = { userId: user._id };
  if (year) {
    const y = parseInt(year);
    filter.saleDate = {
      $gte: new Date(y, 0, 1),
      $lt: new Date(y + 1, 0, 1),
    };
  }

  const gains = await RealizedGain.find(filter).sort({ saleDate: 1 }).lean();

  const headers = [
    "saleDate",
    "ticker",
    "shares",
    "avgBuyPrice",
    "sellPrice",
    "currency",
    "fxRate",
    "gainNative",
    "gainBase",
    "baseCurrency",
  ];
  const lines = [headers.join(",")];
  for (const g of gains) {
    const gainNative = (g.sellPrice - g.avgBuyPrice) * g.shares;
    lines.push(
      [
        g.saleDate.toISOString().slice(0, 10),
        g.ticker,
        g.shares,
        g.avgBuyPrice.toFixed(4),
        g.sellPrice.toFixed(4),
        g.currency,
        g.fxRate.toFixed(6),
        gainNative.toFixed(2),
        g.gainBase.toFixed(2),
        g.baseCurrency,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const filename = year
    ? `steuerbericht-${year}.csv`
    : `steuerbericht-alle.csv`;

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
