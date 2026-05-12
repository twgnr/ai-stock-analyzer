import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { Watchlist } from "@/lib/models/Watchlist";
import { marketRadar, hasClaudeKey } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import {
  getMacroSnapshot,
  formatMacroForPrompt,
  isFredConfigured,
} from "@/lib/fred";
import { getQuote } from "@/lib/yahoo";
import {
  getArticlePageviews,
  guessWikipediaArticle,
} from "@/lib/wikipediaPageviews";
import {
  getGoogleTrendsSnapshot,
  guessTrendsKeyword,
} from "@/lib/googleTrends";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_ATTENTION_TICKERS = 30;
const SPIKE_THRESHOLD = 1.4;

/**
 * Sammelt Attention-Spikes über Portfolio+Watchlist und rendert einen
 * kompakten Prompt-Block. Nutzt die existierenden 6h-Caches aus den
 * Wiki-/Trends-Wrappern, ist also nach erstem Aufruf billig.
 */
async function buildAttentionBlock(tickers: string[]): Promise<string> {
  if (tickers.length === 0) return "";

  // Quotes für Namen — parallel.
  const quotes = await Promise.allSettled(tickers.map((t) => getQuote(t)));
  const namedTickers = tickers.map((t, i) => {
    const q = quotes[i];
    return {
      ticker: t,
      name: q.status === "fulfilled" ? q.value.name || t : t,
    };
  });

  const spikes = await Promise.all(
    namedTickers.map(async (n) => {
      const [wiki, trends] = await Promise.all([
        getArticlePageviews(guessWikipediaArticle(n.name)).catch(() => null),
        getGoogleTrendsSnapshot(guessTrendsKeyword(n.name), { days: 90 }).catch(
          () => null
        ),
      ]);
      const wikiSpike = wiki?.spikeRatio ?? 0;
      const trendsSpike = trends?.spikeRatio ?? 0;
      const combined = Math.max(wikiSpike, trendsSpike);
      return {
        ticker: n.ticker,
        name: n.name,
        wikiSpike,
        trendsSpike,
        combined,
        rising: trends?.rising ?? [],
      };
    })
  );

  const hot = spikes
    .filter((s) => s.combined >= SPIKE_THRESHOLD)
    .sort((a, b) => b.combined - a.combined)
    .slice(0, 8);

  if (hot.length === 0) return "";

  const lines: string[] = [
    "=== AKTUELLE AUFMERKSAMKEITS-SPIKES (Watchlist + Portfolio) ===",
  ];
  for (const s of hot) {
    const sources: string[] = [];
    if (s.wikiSpike >= SPIKE_THRESHOLD) sources.push(`Wiki ${s.wikiSpike.toFixed(2)}x`);
    if (s.trendsSpike >= SPIKE_THRESHOLD)
      sources.push(`Google ${s.trendsSpike.toFixed(2)}x`);
    const risingPart =
      s.rising.length > 0
        ? ` | steigende Suchen: ${s.rising
            .slice(0, 2)
            .map((r) => `„${r.query}"`)
            .join(", ")}`
        : "";
    lines.push(`${s.ticker} (${s.name}): ${sources.join(", ")}${risingPart}`);
  }
  return lines.join("\n");
}

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

  try {
    const body = await req.json().catch(() => ({}));
    const focus: string | undefined = body?.focus;
    const horizon: "long" | "swing" | "short" =
      body?.horizon === "swing" || body?.horizon === "short" ? body.horizon : "long";
    await connectDB();

    const [positions, watchlist] = await Promise.all([
      Position.find({ userId: user._id }).select("ticker").lean(),
      Watchlist.find({ userId: user._id }).select("ticker").lean(),
    ]);
    const existingTickers = positions.map((p) => p.ticker);

    // Beide Zusatz-Quellen parallel — das Markt-Radar sieht damit gleichzeitig
    // das Makro-Umfeld und welche Tickers im Beobachtungs-Universum gerade
    // Aufmerksamkeit ziehen.
    const allTickers = Array.from(
      new Set([
        ...existingTickers.map((t) => t.toUpperCase()),
        ...watchlist.map((w) => w.ticker.toUpperCase()),
      ])
    ).slice(0, MAX_ATTENTION_TICKERS);

    const [macroBlock, attentionBlock] = await Promise.all([
      (async () => {
        if (!(await isFredConfigured())) return undefined;
        const snap = await getMacroSnapshot();
        const formatted = formatMacroForPrompt(snap);
        return snap.series.some((s) => s.latest) ? formatted : undefined;
      })().catch(() => undefined),
      buildAttentionBlock(allTickers).catch(() => ""),
    ]);

    const result = await marketRadar(existingTickers, focus, horizon, user, {
      macroBlock,
      attentionBlock: attentionBlock || undefined,
    });

    return NextResponse.json({
      ...result,
      sourcesUsed: [
        macroBlock ? "FRED Makro-Indikatoren" : null,
        attentionBlock ? "Aufmerksamkeits-Spikes (Wiki + Google)" : null,
      ].filter(Boolean),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Markt-Radar fehlgeschlagen";
    console.error("[market-radar] Fehler:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
