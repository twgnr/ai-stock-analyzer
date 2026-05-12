import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Transaction } from "@/lib/models/Transaction";
import { getCurrentUser } from "@/lib/auth";
import { rebuildPosition } from "@/lib/positionService";
import { getApiTranslations } from "@/lib/i18n-server";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
        i++;
        continue;
      }
      if (c === '"' && cur === "") {
        inQuotes = true;
        i++;
        continue;
      }
      cur += c;
      i++;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { csv, asTransactions } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: t("validation.csvTextMissing") }, { status: 400 });
  }

  await connectDB();

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: t("validation.csvNoRows") }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const tickerIdx = idx("ticker");
  const sharesIdx = idx("shares");
  const avgPriceIdx = idx("avgprice");
  const currencyIdx = idx("currency");
  const nameIdx = idx("name");
  const notesIdx = idx("notes");
  const dateIdx = idx("date");

  if (tickerIdx < 0 || sharesIdx < 0 || avgPriceIdx < 0 || currencyIdx < 0) {
    return NextResponse.json(
      { error: "Pflicht-Spalten fehlen: ticker, shares, avgPrice, currency" },
      { status: 400 }
    );
  }

  let imported = 0;
  const errors: string[] = [];

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    const row = parseCsvLine(lines[lineNo]);
    const ticker = row[tickerIdx]?.trim().toUpperCase();
    const shares = parseFloat(row[sharesIdx]?.replace(",", "."));
    const avgPrice = parseFloat(row[avgPriceIdx]?.replace(",", "."));
    const currency = row[currencyIdx]?.trim().toUpperCase();
    if (!ticker || !(shares > 0) || !(avgPrice > 0) || !currency) {
      errors.push(`Zeile ${lineNo + 1}: ungültig, übersprungen`);
      continue;
    }
    try {
      if (asTransactions) {
        const date = dateIdx >= 0 ? new Date(row[dateIdx]) : new Date();
        await Transaction.create({
          userId: user._id,
          ticker,
          type: "buy",
          shares,
          price: avgPrice,
          currency,
          fees: 0,
          date: isNaN(date.getTime()) ? new Date() : date,
          notes: notesIdx >= 0 ? row[notesIdx] || undefined : undefined,
        });
        await rebuildPosition(user._id, ticker);
      } else {
        await Position.findOneAndUpdate(
          { userId: user._id, ticker },
          {
            $set: {
              userId: user._id,
              ticker,
              shares,
              avgPrice,
              currency,
              name: nameIdx >= 0 ? row[nameIdx] || undefined : undefined,
              notes: notesIdx >= 0 ? row[notesIdx] || undefined : undefined,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }
      imported++;
    } catch (e) {
      errors.push(
        `Zeile ${lineNo + 1}: ${e instanceof Error ? e.message : "Fehler"}`
      );
    }
  }

  return NextResponse.json({ imported, errors });
}
