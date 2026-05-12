import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/lib/models/Transaction";
import { getCurrentUser } from "@/lib/auth";
import { parseBrokerCSV, type BrokerKey } from "@/lib/brokerImport";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data erforderlich" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const broker = (form.get("broker") as string) as BrokerKey;
  const mode = (form.get("mode") as string) || "preview"; // "preview" | "import"

  if (!file) return NextResponse.json({ error: tr("validation.csvMissing") }, { status: 400 });
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `CSV zu groß (max ${(MAX_CSV_BYTES / 1024 / 1024).toFixed(0)} MB)` },
      { status: 400 }
    );
  }
  if (!["comdirect", "tradeRepublic", "ibkr", "generic"].includes(broker)) {
    return NextResponse.json({ error: tr("validation.unknownBroker") }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseBrokerCSV(broker, text);

  if (mode === "preview") {
    return NextResponse.json({
      preview: parsed.rows,
      warnings: parsed.warnings,
      rawRowCount: parsed.rawRowCount,
      skippedRows: parsed.skippedRows,
    });
  }

  await connectDB();
  const existingRefs = new Set<string>(
    (
      await Transaction.find({
        userId: user._id,
        externalRef: { $in: parsed.rows.map((r) => r.externalRef) },
      })
        .select("externalRef")
        .lean()
    ).map((t) => t.externalRef!)
  );

  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];
  for (const row of parsed.rows) {
    if (existingRefs.has(row.externalRef)) {
      duplicates++;
      continue;
    }
    try {
      await Transaction.create({
        userId: user._id,
        ticker: row.ticker,
        type: row.type,
        shares: row.shares,
        price: row.price,
        amount: row.amount,
        currency: row.currency,
        fees: row.fees,
        date: new Date(row.date),
        notes: row.notes,
        externalRef: row.externalRef,
        source: row.source,
      });
      imported++;
    } catch (e) {
      errors.push(
        `${row.date} ${row.ticker}: ${e instanceof Error ? e.message : "Fehler"}`
      );
    }
  }

  return NextResponse.json({
    imported,
    duplicates,
    skipped: parsed.skippedRows,
    errors,
    warnings: parsed.warnings,
  });
}

export const runtime = "nodejs";
