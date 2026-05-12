import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
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

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const positions = await Position.find({ userId: user._id }).sort({ ticker: 1 }).lean();

  const headers = ["ticker", "name", "shares", "avgPrice", "currency", "notes"];
  const lines = [headers.join(",")];
  for (const p of positions) {
    lines.push(
      [
        p.ticker,
        p.name || "",
        p.shares,
        p.avgPrice,
        p.currency,
        p.notes || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  const filename = `portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
