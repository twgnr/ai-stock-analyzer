import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/lib/models/Transaction";
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
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const transactions = await Transaction.find({ userId: user._id })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const headers = [
    "date",
    "ticker",
    "type",
    "shares",
    "price",
    "amount",
    "currency",
    "fees",
    "notes",
  ];
  const lines = [headers.join(",")];
  for (const t of transactions) {
    lines.push(
      [
        new Date(t.date).toISOString().slice(0, 10),
        t.ticker,
        t.type,
        t.shares || "",
        t.price || "",
        t.amount ?? "",
        t.currency,
        t.fees || 0,
        t.notes || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
