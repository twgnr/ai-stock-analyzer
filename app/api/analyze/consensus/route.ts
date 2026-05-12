import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote, getFundamentals, getNews } from "@/lib/yahoo";
import { analyzeStock } from "@/lib/claude";
import { getConfiguredProviders } from "@/lib/ai/factory";
import { PROVIDER_LABELS } from "@/lib/ai/types";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

interface ProviderResult {
  provider: string;
  providerLabel: string;
  model: string;
  recommendation?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  risks?: string[];
  opportunities?: string[];
  error?: string;
  durationMs: number;
}

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const configs = getConfiguredProviders(user);
  if (configs.length < 2) {
    return NextResponse.json(
      {
        error:
          "Für Multi-Modell-Konsens müssen mindestens 2 Provider konfiguriert sein. Trage einen zweiten Key in den Einstellungen ein.",
      },
      { status: 400 }
    );
  }

  const { ticker } = await req.json();
  if (!ticker) return NextResponse.json({ error: t("validation.tickerMissing") }, { status: 400 });
  const symbol = String(ticker).toUpperCase();

  try {
    const [quote, fundamentals, news] = await Promise.all([
      getQuote(symbol),
      getFundamentals(symbol),
      getNews(symbol, 8),
    ]);

    const ctx = {
      ticker: symbol,
      name: quote.name,
      price: quote.price,
      currency: quote.currency,
      changePercent: quote.changePercent,
      fundamentals: fundamentals as Record<string, unknown> | null,
      news: news.map((n) => ({
        title: n.title,
        publisher: n.publisher,
        publishedAt: n.publishedAt,
      })),
    };

    const results: ProviderResult[] = await Promise.all(
      configs.map(async (config): Promise<ProviderResult> => {
        const started = Date.now();
        try {
          const r = await analyzeStock(ctx, user, config);
          return {
            provider: config.provider,
            providerLabel: PROVIDER_LABELS[config.provider],
            model: config.model,
            recommendation: r.recommendation,
            confidence: r.confidence,
            summary: r.summary,
            reasoning: r.reasoning,
            risks: r.risks,
            opportunities: r.opportunities,
            durationMs: Date.now() - started,
          };
        } catch (e) {
          return {
            provider: config.provider,
            providerLabel: PROVIDER_LABELS[config.provider],
            model: config.model,
            error: e instanceof Error ? e.message : "Fehler",
            durationMs: Date.now() - started,
          };
        }
      })
    );

    const validResults = results.filter((r) => r.recommendation);
    const recCounts = new Map<string, number>();
    for (const r of validResults) {
      if (r.recommendation) {
        recCounts.set(r.recommendation, (recCounts.get(r.recommendation) || 0) + 1);
      }
    }
    const sortedRecs = [...recCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topRec = sortedRecs[0]?.[0];
    const agreement =
      validResults.length > 0 && topRec
        ? (sortedRecs[0][1] / validResults.length) * 100
        : 0;
    const avgConfidence =
      validResults.length > 0
        ? validResults.reduce((s, r) => s + (r.confidence || 0), 0) / validResults.length
        : 0;

    let consensusLabel: "Einstimmig" | "Mehrheit" | "Gespalten" = "Gespalten";
    if (agreement === 100) consensusLabel = "Einstimmig";
    else if (agreement >= 67) consensusLabel = "Mehrheit";

    return NextResponse.json({
      ticker: symbol,
      name: quote.name,
      results,
      consensus: {
        recommendation: topRec,
        agreement,
        label: consensusLabel,
        avgConfidence,
        providerCount: configs.length,
        successfulCount: validResults.length,
        distribution: Object.fromEntries(recCounts),
      },
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Konsens-Fehler");
  }
}
