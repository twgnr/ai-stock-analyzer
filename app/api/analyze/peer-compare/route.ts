import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuote, getFundamentals } from "@/lib/yahoo";
import { comparePeers, hasClaudeKey } from "@/lib/claude";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations } from "@/lib/i18n-server";

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

  const { tickerA, tickerB } = await req.json();
  if (!tickerA || !tickerB) {
    return NextResponse.json({ error: t("validation.tickerAandBRequired") }, { status: 400 });
  }
  if (tickerA.toUpperCase() === tickerB.toUpperCase()) {
    return NextResponse.json({ error: t("validation.twoDifferentStocks") }, { status: 400 });
  }

  try {
    const symA = tickerA.toUpperCase();
    const symB = tickerB.toUpperCase();
    const [qA, qB, fA, fB] = await Promise.all([
      getQuote(symA),
      getQuote(symB),
      getFundamentals(symA),
      getFundamentals(symB),
    ]);

    const result = await comparePeers(
      {
        a: {
          ticker: symA,
          name: qA.name,
          price: qA.price,
          currency: qA.currency,
          fundamentals: fA as Record<string, unknown> | null,
        },
        b: {
          ticker: symB,
          name: qB.name,
          price: qB.price,
          currency: qB.currency,
          fundamentals: fB as Record<string, unknown> | null,
        },
      },
      user
    );

    return NextResponse.json({
      ...result,
      a: {
        ticker: symA,
        name: qA.name,
        price: qA.price,
        currency: qA.currency,
        changePercent: qA.changePercent,
      },
      b: {
        ticker: symB,
        name: qB.name,
        price: qB.price,
        currency: qB.currency,
        changePercent: qB.changePercent,
      },
    });
  } catch (e) {
    return apiErrorResponse(e, 500, "Peer-Vergleich fehlgeschlagen");
  }
}
