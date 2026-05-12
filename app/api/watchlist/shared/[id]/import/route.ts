import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SharedWatchlist } from "@/lib/models/SharedWatchlist";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const tr = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: tr("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const w = await SharedWatchlist.findById(id);
  if (!w) return NextResponse.json({ error: tr("resource.notFound") }, { status: 404 });
  if (String(w.userId) !== user.userId && !w.isPublic) {
    return NextResponse.json({ error: tr("auth.notAuthorized") }, { status: 403 });
  }

  let added = 0;
  let skipped = 0;
  for (const t of w.tickers) {
    try {
      const created = await Watchlist.findOneAndUpdate(
        { userId: user._id, ticker: t.ticker },
        {
          $setOnInsert: {
            userId: user._id,
            ticker: t.ticker,
            name: t.name,
            notes: t.notes,
          },
        },
        { upsert: true, new: false, setDefaultsOnInsert: true }
      );
      if (created) skipped += 1;
      else added += 1;
    } catch {
      skipped += 1;
    }
  }

  if (String(w.userId) !== user.userId) {
    w.importCount = (w.importCount || 0) + 1;
    await w.save();
  }

  return NextResponse.json({ added, skipped, total: w.tickers.length });
}
