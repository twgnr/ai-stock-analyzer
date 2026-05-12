import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { StockNote } from "@/lib/models/StockNote";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_BODY = 5000;

function normalizeTicker(raw: string | null): string {
  return (raw ?? "").toUpperCase().trim();
}

export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const ticker = normalizeTicker(req.nextUrl.searchParams.get("ticker"));
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  // Gepinnte Notizen zuerst, dann jüngste oben.
  const items = await StockNote.find({ userId: user._id, ticker })
    .sort({ pinned: -1, createdAt: -1 })
    .lean();
  return NextResponse.json(
    items.map((n) => ({
      _id: String(n._id),
      ticker: n.ticker,
      body: n.body,
      pinned: !!n.pinned,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const json = await req.json();
  const ticker =
    typeof json?.ticker === "string" ? json.ticker.toUpperCase().trim() : "";
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });

  const text = typeof json?.body === "string" ? json.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: t("validation.noteEmpty") }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Notiz zu lang (max. ${MAX_BODY} Zeichen)` },
      { status: 400 }
    );
  }
  const pinned = json?.pinned === true;

  try {
    const created = await StockNote.create({
      userId: user._id,
      ticker,
      body: text,
      pinned,
    });
    return NextResponse.json(
      {
        _id: String(created._id),
        ticker: created.ticker,
        body: created.body,
        pinned: created.pinned,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
