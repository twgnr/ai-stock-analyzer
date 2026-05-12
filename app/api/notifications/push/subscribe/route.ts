import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { isPushConfigured } from "@/lib/webPush";
import { getApiTranslations } from "@/lib/i18n-server";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push-Service nicht konfiguriert." },
      { status: 503 }
    );
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: t("validation.invalidPayload") }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return NextResponse.json({ error: t("validation.endpointKeysMissing") }, { status: 400 });
  }

  await connectDB();
  const userAgent = req.headers.get("user-agent")?.slice(0, 300);

  // Upsert auf endpoint — derselbe Endpoint kommt nur einmal vor.
  await PushSubscription.findOneAndUpdate(
    { endpoint: body.endpoint },
    {
      $set: {
        userId: user._id,
        endpoint: body.endpoint,
        keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
        userAgent,
      },
    },
    { upsert: true, new: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: t("validation.invalidPayload") }, { status: 400 });
  }

  await connectDB();
  if (body.endpoint) {
    await PushSubscription.deleteOne({ endpoint: body.endpoint, userId: user._id });
  } else {
    // Komplett-Reset für diesen User
    await PushSubscription.deleteMany({ userId: user._id });
  }
  return NextResponse.json({ ok: true });
}
