import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Position } from "@/lib/models/Position";
import { NewsDigest } from "@/lib/models/NewsDigest";
import { Watchlist } from "@/lib/models/Watchlist";
import { getCurrentUser } from "@/lib/auth";
import { getQuotes, getNews, getChart } from "@/lib/yahoo";
import { apiErrorResponse } from "@/lib/apiError";
import {
  analyzeNewsDigest,
  hasClaudeKey,
  getModelName,
  type NewsDigestTickerInput,
} from "@/lib/claude";
import { sendMail } from "@/lib/email";
import { getApiTranslations, getEmailTranslations } from "@/lib/i18n-server";

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

  const body = await req.json().catch(() => ({}));
  const periodDays =
    typeof body?.periodDays === "number" && body.periodDays > 0 && body.periodDays <= 30
      ? body.periodDays
      : 7;
  const includeWatchlist = !!body?.includeWatchlist;
  const sendEmail = !!body?.sendEmail;

  await connectDB();
  const positions = await Position.find({ userId: user._id }).lean();
  const watchlist = includeWatchlist
    ? await Watchlist.find({ userId: user._id }).lean()
    : [];

  const allTickers = [
    ...new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...watchlist.map((w) => w.ticker.toUpperCase()),
    ]),
  ];
  if (allTickers.length === 0) {
    return NextResponse.json(
      { error: "Keine Positionen und keine Watchlist — nichts zum Analysieren." },
      { status: 400 }
    );
  }

  try {
    const [quotes, ...newsPerTicker] = await Promise.all([
      getQuotes(allTickers),
      ...allTickers.map((t) => getNews(t, 10).catch(() => [])),
    ]);
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);

    const inputs: NewsDigestTickerInput[] = await Promise.all(
      allTickers.map(async (t, idx) => {
        const q = quoteMap.get(t);
        const relevantNews = (newsPerTicker[idx] as Array<{ title: string; publisher: string; publishedAt: string }>)
          .filter((n) => new Date(n.publishedAt) >= cutoff)
          .slice(0, 8);

        let priceChangePct: number | undefined;
        try {
          const r = periodDays <= 7 ? "1mo" : periodDays <= 30 ? "3mo" : "6mo";
          const candles = await getChart(t, r, "1d");
          const inRange = candles.filter(
            (c) => c.time * 1000 >= cutoff.getTime()
          );
          if (inRange.length >= 2) {
            const first = inRange[0].close;
            const last = inRange[inRange.length - 1].close;
            if (first > 0) priceChangePct = ((last - first) / first) * 100;
          }
        } catch {}

        return {
          ticker: t,
          name: q?.name || positions.find((p) => p.ticker === t)?.name || t,
          currency: q?.currency || "USD",
          priceChangePct,
          news: relevantNews,
        };
      })
    );

    const result = await analyzeNewsDigest(
      { periodDays, positions: inputs },
      user
    );

    const doc = await NewsDigest.create({
      userId: user._id,
      periodDays,
      tickers: allTickers,
      headline: result.headline || "Portfolio-Digest",
      summary: result.summary || "",
      marketOverview: result.marketOverview || "",
      perTicker: (result.perTicker || []).map((p) => ({
        ticker: p.ticker,
        name: p.name,
        relevance: p.relevance,
        impact: p.impact,
        summary: p.summary,
        keyFacts: p.keyFacts || [],
        priceChangePct: p.priceChangePct,
      })),
      upcomingEvents: result.upcomingEvents || [],
      watchNext: result.watchNext || [],
      model: getModelName(user),
    });

    if (sendEmail) {
      const tMail = await getEmailTranslations(user.locale);
      const headline = result.headline || tMail("newsDigest.defaultHeadline");
      const greeting = user.name
        ? tMail("newsDigest.greetingNamed", { name: user.name })
        : tMail("newsDigest.greeting");
      const lines: string[] = [
        greeting,
        "",
        tMail("newsDigest.intro", { periodDays }),
        "",
        headline,
        "",
        result.summary || "",
        "",
        tMail("newsDigest.sectionMarket"),
        result.marketOverview || "—",
        "",
      ];
      if (result.perTicker && result.perTicker.length > 0) {
        lines.push(tMail("newsDigest.sectionPerTicker"));
        for (const p of result.perTicker) {
          lines.push(
            `• ${p.ticker}${p.priceChangePct != null ? ` (${p.priceChangePct >= 0 ? "+" : ""}${p.priceChangePct.toFixed(2)}%)` : ""} — ${p.impact}`
          );
          lines.push(`  ${p.summary}`);
          if (p.keyFacts && p.keyFacts.length > 0) {
            for (const f of p.keyFacts) lines.push(`    - ${f}`);
          }
        }
        lines.push("");
      }
      if (result.watchNext && result.watchNext.length > 0) {
        lines.push(tMail("newsDigest.sectionWatchNext"));
        result.watchNext.forEach((w) => lines.push(`• ${w}`));
        lines.push("");
      }
      if (result.upcomingEvents && result.upcomingEvents.length > 0) {
        lines.push(tMail("newsDigest.sectionUpcoming"));
        result.upcomingEvents.forEach((e) => lines.push(`• ${e}`));
        lines.push("");
      }
      lines.push(
        tMail("newsDigest.fullView", {
          url: `${process.env.APP_URL || "http://localhost:3000"}/news-digest/${String(doc._id)}`,
        }),
        "",
        tMail("common.signature")
      );
      try {
        await sendMail({
          to: user.email,
          subject: tMail("newsDigest.subject", { periodDays, headline }),
          text: lines.join("\n"),
        });
        doc.mailedAt = new Date();
        await doc.save();
      } catch (e) {
        console.error("[news-digest] mail failed", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ _id: String(doc._id) });
  } catch (e) {
    return apiErrorResponse(e, 500, "Digest-Generierung fehlgeschlagen.");
  }
}

export const runtime = "nodejs";
export const maxDuration = 120;
