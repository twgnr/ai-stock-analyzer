import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SharedWatchlist } from "@/lib/models/SharedWatchlist";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const w = await SharedWatchlist.findById(id).lean();
  if (!w) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  const isOwn = String(w.userId) === user.userId;
  if (!isOwn && !w.isPublic) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }

  return NextResponse.json({
    _id: String(w._id),
    title: w.title,
    description: w.description,
    tickers: w.tickers || [],
    isPublic: w.isPublic,
    isOwn,
    uploaderName: w.uploaderName,
    uploaderEmail: isOwn ? w.uploaderEmail : undefined,
    importCount: w.importCount,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const w = await SharedWatchlist.findById(id);
  if (!w) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(w.userId) !== user.userId) {
    return NextResponse.json({ error: t("resource.uploaderOnlyEdit") }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body?.title === "string") {
    const title = body.title.trim();
    if (!title || title.length > 100) {
      return NextResponse.json({ error: t("validation.titleInvalid") }, { status: 400 });
    }
    w.title = title;
  }
  if (typeof body?.description === "string") {
    w.description = body.description.trim().slice(0, 500);
  }
  if (typeof body?.isPublic === "boolean") {
    w.isPublic = body.isPublic;
  }
  if (Array.isArray(body?.tickers)) {
    w.tickers = body.tickers
      .map((t: unknown) => {
        if (typeof t === "string") return { ticker: t.toUpperCase().trim() };
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
        ): t is { ticker: string; name?: string; notes?: string } => t !== null
      );
  }
  await w.save();

  return NextResponse.json({ _id: String(w._id), isPublic: w.isPublic });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const w = await SharedWatchlist.findById(id);
  if (!w) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(w.userId) !== user.userId) {
    return NextResponse.json({ error: t("resource.uploaderOnlyDelete") }, { status: 403 });
  }
  await SharedWatchlist.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
