import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { getQuotes, getFundamentals } from "@/lib/yahoo";
import { getRates, BASE_CURRENCY } from "@/lib/fx";
import { analyzeMacroScenario, hasClaudeKey } from "@/lib/claude";
import { getCurrentUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiError";
import { rateLimitResponse } from "@/lib/rateLimit";
import {
  getMacroSnapshot,
  formatMacroForPrompt,
  isFredConfigured,
} from "@/lib/fred";
import { getApiTranslations } from "@/lib/i18n-server";

const MAX_SCENARIO_LEN = 1000;

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const limited = rateLimitResponse(`macro-scenario:${user.userId}`, 20, 60 * 60);
  if (limited) return limited;

  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const body = await req.json();
  const scenario = String(body?.scenario || "").trim();
  if (!scenario)
    return NextResponse.json({ error: t("validation.scenarioMissing") }, { status: 400 });
  if (scenario.length > MAX_SCENARIO_LEN)
    return NextResponse.json(
      { error: `Szenario zu lang (max. ${MAX_SCENARIO_LEN} Zeichen).` },
      { status: 413 }
    );

  try {
    await connectDB();
    const positions = await Position.find({ userId: user._id }).lean();
    if (positions.length === 0) {
      return NextResponse.json({ error: t("resource.portfolioEmpty") }, { status: 400 });
    }

    const tickers = positions.map((p) => p.ticker);
    const quotes = await getQuotes(tickers);
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

    const currencies = [
      ...new Set<string>(quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))),
    ];
    const fxRates = await getRates(currencies, BASE_CURRENCY);

    const fundamentalsResults = await Promise.all(
      tickers.map((t) => getFundamentals(t).catch(() => null))
    );
    const fundMap = new Map<string, { sector?: string; country?: string } | null>();
    tickers.forEach((t, i) => {
      const f = fundamentalsResults[i];
      fundMap.set(t, f ? { sector: f.sector, country: f.country } : null);
    });

    let totalValueBase = 0;
    const enriched = positions
      .map((p) => {
        const q = quoteMap.get(p.ticker);
        if (!q) return null;
        const marketValue = q.price * p.shares;
        const rate = q.currency === BASE_CURRENCY ? 1 : fxRates[q.currency.toUpperCase()] ?? 0;
        const marketValueBase = marketValue * rate;
        totalValueBase += marketValueBase;
        const fund = fundMap.get(p.ticker);
        return {
          ticker: p.ticker,
          name: q.name,
          marketValue: marketValueBase,
          currency: q.currency,
          sector: fund?.sector,
          country: fund?.country,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const withWeights = enriched.map((e) => ({
      ...e,
      weight: totalValueBase > 0 ? (e.marketValue / totalValueBase) * 100 : 0,
    }));

    // Aktuelle Makro-Indikatoren als Anker fürs Prompt — nur wenn der Admin
    // einen FRED-Key hinterlegt hat. Sonst läuft die Analyse weiter ohne.
    let macroBlock: string | undefined;
    if (await isFredConfigured()) {
      const snap = await getMacroSnapshot();
      const formatted = formatMacroForPrompt(snap);
      if (formatted && snap.series.some((s) => s.latest)) {
        macroBlock = formatted;
      }
    }

    const result = await analyzeMacroScenario(
      scenario,
      withWeights,
      BASE_CURRENCY,
      user,
      { macroBlock }
    );
    return NextResponse.json({
      ...result,
      totalValueBase,
      baseCurrency: BASE_CURRENCY,
      positionCount: withWeights.length,
      macroBlockUsed: Boolean(macroBlock),
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Macro-Szenario-Analyse fehlgeschlagen");
  }
}
