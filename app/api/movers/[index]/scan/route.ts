import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rebuildMoversSnapshot } from "@/lib/marketMovers";
import { SHARED_INDEX_KEYS, type IndexKey } from "@/lib/indexConstituents";
import { rateLimitResponse } from "@/lib/rateLimit";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ index: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  // Ein User darf höchstens 10 Scans/Stunde manuell auslösen — der Scan-Lock
  // greift zwar als Semaphor, aber ohne Rate-Limit könnte ein Angreifer per
  // User die Yahoo-Quota oder den Finnhub-Rate-Limit gegen uns wenden.
  const limited = rateLimitResponse(`movers-scan:${user.userId}`, 10, 60 * 60);
  if (limited) return limited;

  const { index } = await params;
  const key = index.toLowerCase();
  if (!SHARED_INDEX_KEYS.includes(key as IndexKey)) {
    return NextResponse.json(
      {
        error:
          "Nur geteilte Indizes können gescannt werden — Portfolio/Watchlist laden immer live.",
      },
      { status: 400 }
    );
  }

  const result = await rebuildMoversSnapshot(key as IndexKey, {
    email: user.email,
    name: user.name,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason || "Scan fehlgeschlagen" },
      { status: 409 }
    );
  }
  const s = result.snapshot!;
  return NextResponse.json({
    ok: true,
    snapshot: {
      indexKey: s.indexKey,
      rows: s.rows,
      scannedAt: s.scannedAt,
      universeSize: s.universeSize,
      scanDurationMs: s.scanDurationMs,
      scanInProgress: s.scanInProgress,
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 120;
