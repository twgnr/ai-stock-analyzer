import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MagazineAnalysis } from "@/lib/models/MagazineAnalysis";
import { getAppSettings } from "@/lib/models/AppSettings";
import { getCurrentUser } from "@/lib/auth";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const doc = await MagazineAnalysis.findById(id).lean();
  if (!doc) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  const isOwn = String(doc.userId) === user.userId;
  const settings = await getAppSettings();
  const sharingEnabled = settings.magazineSharingEnabled !== false;
  // Fremdzugriff nur, wenn Analyse public UND Sharing global aktiviert ist
  if (!isOwn && (!doc.isPublic || !sharingEnabled)) {
    return NextResponse.json({ error: t("auth.notAuthorized") }, { status: 403 });
  }

  return NextResponse.json({
    _id: String(doc._id),
    magazineTitle: doc.magazineTitle,
    customTitle: doc.customTitle ?? null,
    issueNumber: doc.issueNumber,
    issueDate: doc.issueDate,
    summary: doc.summary,
    coverTopics: doc.coverTopics,
    marketOutlook: doc.marketOutlook,
    recommendations: doc.recommendations,
    isPublic: doc.isPublic,
    isOwn,
    uploaderName: doc.uploaderName,
    uploaderEmail: isOwn ? doc.uploaderEmail : undefined,
    originalFilename: doc.originalFilename,
    provider: doc.provider || null,
    model: doc.model,
    createdAt: doc.createdAt,
    config: { sharingEnabled },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const doc = await MagazineAnalysis.findById(id);
  if (!doc) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(doc.userId) !== user.userId) {
    return NextResponse.json({ error: t("resource.uploaderOnlyEdit") }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body?.isPublic === "boolean") {
    if (body.isPublic === true) {
      const settings = await getAppSettings();
      if (settings.magazineSharingEnabled === false) {
        return NextResponse.json(
          {
            error:
              "Teilen ist global deaktiviert. Bitte Administrator kontaktieren.",
          },
          { status: 403 }
        );
      }
    }
    doc.isPublic = body.isPublic;
  }
  await doc.save();

  return NextResponse.json({
    _id: String(doc._id),
    isPublic: doc.isPublic,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;

  const doc = await MagazineAnalysis.findById(id);
  if (!doc) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });
  if (String(doc.userId) !== user.userId) {
    return NextResponse.json({ error: t("resource.uploaderOnlyDelete") }, { status: 403 });
  }

  await MagazineAnalysis.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
