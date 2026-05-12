import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote } from "@/lib/yahoo";
import { analyzeChartVision, hasClaudeKey } from "@/lib/claude";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  let imageBase64: string | null = null;
  let imageMime = "image/png";
  let ticker: string | undefined;
  let range: string | undefined;
  let activeIndicators: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: t("validation.imageMissing") }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Bild zu groß (max ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB)` },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    imageBase64 = buffer.toString("base64");
    imageMime = file.type || "image/png";
    ticker = (form.get("ticker") as string) || undefined;
    range = (form.get("range") as string) || undefined;
    const indStr = (form.get("indicators") as string) || "";
    activeIndicators = indStr.split(",").filter(Boolean);
  } else {
    const body = await req.json().catch(() => ({}));
    imageBase64 = body?.imageBase64;
    imageMime = body?.imageMime || "image/png";
    ticker = body?.ticker;
    range = body?.range;
    activeIndicators = Array.isArray(body?.indicators) ? body.indicators : [];
  }

  if (!imageBase64) {
    return NextResponse.json({ error: t("validation.imageMissing") }, { status: 400 });
  }

  try {
    let ctxExtra: {
      name?: string;
      currentPrice?: number;
      currency?: string;
      priceContext?: {
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        last10Closes?: number[];
      };
    } = {};
    if (ticker) {
      try {
        const quote = await getQuote(ticker.toUpperCase());
        ctxExtra = {
          name: quote.name,
          currentPrice: quote.price,
          currency: quote.currency,
          priceContext: {
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          },
        };
      } catch {
        // ignore — upload-only mode might have no valid ticker
      }
    }

    const result = await analyzeChartVision(
      {
        ticker: ticker?.toUpperCase(),
        range,
        activeIndicators,
        image: { base64: imageBase64, mimeType: imageMime },
        ...ctxExtra,
      },
      user
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Vision-Analyse fehlgeschlagen";
    console.error("[chart-vision]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
