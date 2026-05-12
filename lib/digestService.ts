import { Types } from "mongoose";
import { connectDB } from "./mongodb";
import { User } from "./models/User";
import { Position } from "./models/Position";
import { getQuotes, getFundamentals } from "./yahoo";
import { getRates, BASE_CURRENCY } from "./fx";
import { analyzePortfolio } from "./claude";
import { sendMail } from "./email";
import { fmtCurrency, fmtPercent } from "./format";
import { hasAIKey } from "./ai/factory";
import { decryptSecret } from "./secretCrypto";
import type { SessionUser } from "./auth";
import { getEmailTranslations } from "./i18n-server";

export async function generateDigestForUser(userId: Types.ObjectId | string): Promise<{ sent: boolean; reason?: string }> {
  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) return { sent: false, reason: "user not found" };
  if (!user.digestEnabled) return { sent: false, reason: "digest disabled" };
  if (!hasAIKey(user)) return { sent: false, reason: "no ai key" };

  const positions = await Position.find({ userId }).lean();
  if (positions.length === 0) return { sent: false, reason: "empty portfolio" };

  const tickers = positions.map((p) => p.ticker);
  const quotes = await getQuotes(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  const currencies = [
    ...new Set<string>(
      quotes.map((q) => q.currency).concat(positions.map((p) => p.currency))
    ),
  ];
  const fxRates = await getRates(currencies, BASE_CURRENCY);
  const rateFor = (c: string) =>
    c.toUpperCase() === BASE_CURRENCY ? 1 : fxRates[c.toUpperCase()] ?? 0;

  let totalValueBase = 0;
  let totalCostBase = 0;
  const enriched = positions
    .map((p) => {
      const q = quoteMap.get(p.ticker);
      if (!q) return null;
      const marketValue = q.price * p.shares * rateFor(q.currency);
      const cost = p.avgPrice * p.shares * rateFor(p.currency);
      totalValueBase += marketValue;
      totalCostBase += cost;
      return {
        ticker: p.ticker,
        name: q.name,
        shares: p.shares,
        avgPrice: p.avgPrice,
        currentPrice: q.price,
        currency: q.currency,
        marketValue,
        changePercent: q.changePercent,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const totalPL = totalValueBase - totalCostBase;
  const totalPLPct = totalCostBase ? (totalPL / totalCostBase) * 100 : 0;
  const todayChange = enriched.reduce(
    (s, p) => s + p.changePercent * (p.marketValue / (totalValueBase || 1)),
    0
  );

  const fundamentalsResults = await Promise.all(
    tickers.slice(0, 10).map((t) => getFundamentals(t).catch(() => null))
  );
  const sectorMap = new Map<string, string | undefined>();
  tickers.forEach((t, i) => sectorMap.set(t, fundamentalsResults[i]?.sector));

  const forClaude = enriched.slice(0, 10).map((e) => ({
    ticker: e.ticker,
    name: e.name,
    shares: e.shares,
    avgPrice: e.avgPrice,
    currentPrice: e.currentPrice,
    currency: e.currency,
    marketValue: e.marketValue,
    sector: sectorMap.get(e.ticker),
    weight: totalValueBase > 0 ? (e.marketValue / totalValueBase) * 100 : 0,
  }));

  let analysis: Awaited<ReturnType<typeof analyzePortfolio>> | null = null;
  try {
    const sessionUser: SessionUser = {
      _id: user._id,
      userId: String(user._id),
      email: user.email,
      name: user.name,
      // Keys liegen verschlüsselt in der DB — für den Runtime-KI-Call einmalig entschlüsseln.
      claudeApiKey: decryptSecret(user.claudeApiKey) || undefined,
      claudeModel: user.claudeModel,
      geminiApiKey: decryptSecret(user.geminiApiKey) || undefined,
      geminiModel: user.geminiModel,
      openaiApiKey: decryptSecret(user.openaiApiKey) || undefined,
      openaiBaseUrl: user.openaiBaseUrl,
      openaiModel: user.openaiModel,
      ollamaBaseUrl: user.ollamaBaseUrl,
      ollamaModel: user.ollamaModel,
      aiProvider: user.aiProvider || "claude",
      aiDisabled: !!user.aiDisabled,
      baseCurrency: user.baseCurrency || "EUR",
      role: user.role || "user",
      emailVerified: !!user.emailVerified,
      approved: user.approved !== false,
    };
    analysis = await analyzePortfolio(
      forClaude,
      totalValueBase,
      BASE_CURRENCY,
      sessionUser
    );
  } catch (e) {
    console.error("[digest] claude error", e instanceof Error ? e.message : e);
  }

  const losers = [...enriched]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 3);
  const gainers = [...enriched]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3);

  const tMail = await getEmailTranslations(user.locale);
  const greeting = user.name
    ? tMail("portfolioDigest.greetingNamed", { name: user.name })
    : tMail("portfolioDigest.greeting");
  // Datum in der User-Locale formatieren, damit Subject zur Mail-Sprache passt.
  const dateFormatted = new Date().toLocaleDateString(user.locale === "en" ? "en-US" : "de-DE");

  const lines: string[] = [
    greeting,
    "",
    tMail("portfolioDigest.intro"),
    "",
    tMail("portfolioDigest.sectionOverview"),
    tMail("portfolioDigest.labelPortfolioValue", { value: fmtCurrency(totalValueBase, BASE_CURRENCY) }),
    tMail("portfolioDigest.labelTotalPL", { value: fmtCurrency(totalPL, BASE_CURRENCY), percent: fmtPercent(totalPLPct) }),
    tMail("portfolioDigest.labelTodayChange", { percent: fmtPercent(todayChange) }),
    "",
    tMail("portfolioDigest.sectionTopMovers"),
    tMail("portfolioDigest.labelGainers"),
    ...gainers.map((g) =>
      tMail("portfolioDigest.lineGainer", { ticker: g.ticker, percent: fmtPercent(g.changePercent) })
    ),
    tMail("portfolioDigest.labelLosers"),
    ...losers.map((l) =>
      tMail("portfolioDigest.lineLoser", { ticker: l.ticker, percent: fmtPercent(l.changePercent) })
    ),
    "",
  ];

  if (analysis) {
    lines.push(
      tMail("portfolioDigest.sectionAI"),
      tMail("portfolioDigest.labelRiskLevel", { level: analysis.riskLevel }),
      "",
      analysis.summary,
      "",
      tMail("portfolioDigest.labelDiversification"),
      analysis.diversification,
      ""
    );
    if (analysis.suggestions?.length > 0) {
      lines.push(tMail("portfolioDigest.labelSuggestions"));
      analysis.suggestions.forEach((s) => lines.push(`  • ${s}`));
      lines.push("");
    }
  }

  lines.push(
    tMail("portfolioDigest.details", { url: process.env.APP_URL || "http://localhost:3000" }),
    "",
    tMail("portfolioDigest.unsubscribe"),
    "",
    tMail("common.signature")
  );

  const recipient = user.notificationEmail || user.email;
  const result = await sendMail({
    to: recipient,
    subject: tMail("portfolioDigest.subject", { date: dateFormatted }),
    text: lines.join("\n"),
  });

  return { sent: result.sent };
}

export async function sendDigestsForAllEligibleUsers(): Promise<{
  processed: number;
  sent: number;
}> {
  await connectDB();
  const users = await User.find({ digestEnabled: true }).select("_id").lean();
  let sent = 0;
  for (const u of users) {
    try {
      const result = await generateDigestForUser(u._id);
      if (result.sent) sent += 1;
    } catch (e) {
      console.error("[digest] user", u._id, e instanceof Error ? e.message : e);
    }
  }
  return { processed: users.length, sent };
}
