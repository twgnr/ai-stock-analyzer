import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SharedWatchlist } from "@/lib/models/SharedWatchlist";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const [mine, community] = await Promise.all([
    SharedWatchlist.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    SharedWatchlist.find({
      isPublic: true,
      userId: { $ne: user._id },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const shape = (w: (typeof mine)[number], includeEmail: boolean) => ({
    _id: String(w._id),
    title: w.title,
    description: w.description,
    tickerCount: w.tickers?.length || 0,
    tickers: w.tickers?.slice(0, 6).map((t) => t.ticker) || [],
    isPublic: w.isPublic,
    isOwn: String(w.userId) === user.userId,
    uploaderName: w.uploaderName,
    uploaderEmail: includeEmail ? w.uploaderEmail : undefined,
    importCount: w.importCount,
    createdAt: w.createdAt,
  });

  return NextResponse.json({
    mine: mine.map((w) => shape(w, true)),
    community: community.map((w) => shape(w, false)),
  });
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const body = await req.json();
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: t("validation.titleMissing") }, { status: 400 });
  if (title.length > 100) {
    return NextResponse.json({ error: t("validation.titleTooLong") }, { status: 400 });
  }

  const description = body?.description ? String(body.description).trim().slice(0, 500) : undefined;
  const isPublic = !!body?.isPublic;
  const rawTickers = Array.isArray(body?.tickers) ? body.tickers : [];
  const tickers = rawTickers
    .map((t: unknown) => {
      if (typeof t === "string") {
        return { ticker: t.toUpperCase().trim() };
      }
      if (typeof t === "object" && t !== null) {
        const rec = t as Record<string, unknown>;
        const ticker = String(rec.ticker || "").toUpperCase().trim();
        if (!ticker) return null;
        return {
          ticker,
          name: rec.name ? String(rec.name) : undefined,
          notes: rec.notes ? String(rec.notes).slice(0, 300) : undefined,
        };
      }
      return null;
    })
    .filter(
      (
        t: { ticker: string; name?: string; notes?: string } | null
      ): t is { ticker: string; name?: string; notes?: string } =>
        t !== null && !!t.ticker
    );

  const created = await SharedWatchlist.create({
    userId: user._id,
    uploaderEmail: user.email,
    uploaderName: user.name,
    title,
    description,
    tickers,
    isPublic,
  });

  return NextResponse.json({ _id: String(created._id) }, { status: 201 });
}
