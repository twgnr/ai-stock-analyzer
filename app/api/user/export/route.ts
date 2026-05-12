import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { Position } from "@/lib/models/Position";
import { Transaction } from "@/lib/models/Transaction";
import { Watchlist } from "@/lib/models/Watchlist";
import { PriceAlert } from "@/lib/models/PriceAlert";
import { PortfolioSnapshot } from "@/lib/models/PortfolioSnapshot";
import { RealizedGain } from "@/lib/models/RealizedGain";
import { SharedWatchlist } from "@/lib/models/SharedWatchlist";
import { MagazineAnalysis } from "@/lib/models/MagazineAnalysis";
import { NewsDigest } from "@/lib/models/NewsDigest";
import { RebalanceTarget } from "@/lib/models/RebalanceTarget";
import { SavedScreen } from "@/lib/models/SavedScreen";
import { UsageLog } from "@/lib/models/UsageLog";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * DSGVO-Auskunft (Art. 15) + Datenportabilität (Art. 20).
 * Liefert alle personenbezogenen Daten des eingeloggten Users als
 * machine-readable JSON (Download). Passwort-Hash wird nicht mitgeliefert.
 */
export async function GET() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();

  const userId = user._id;

  const [
    userDoc,
    positions,
    transactions,
    watchlist,
    alerts,
    snapshots,
    realizedGains,
    sharedWatchlists,
    magazineAnalyses,
    newsDigests,
    rebalanceTargets,
    savedScreens,
    investmentTheses,
    usageLogs,
  ] = await Promise.all([
    User.findById(userId)
      .select(
        "-passwordHash -totpSecret -__v -claudeApiKey -geminiApiKey -openaiApiKey"
      )
      .lean(),
    Position.find({ userId }).lean(),
    Transaction.find({ userId }).lean(),
    Watchlist.find({ userId }).lean(),
    PriceAlert.find({ userId }).lean(),
    PortfolioSnapshot.find({ userId }).lean(),
    RealizedGain.find({ userId }).lean(),
    SharedWatchlist.find({ userId }).lean(),
    MagazineAnalysis.find({ userId }).lean(),
    NewsDigest.find({ userId }).lean(),
    RebalanceTarget.find({ userId }).lean(),
    SavedScreen.find({ userId }).lean(),
    InvestmentThesis.find({ userId }).lean(),
    UsageLog.find({ userId }).select("-__v").lean(),
  ]);

  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      userId: String(userId),
      note:
        "Export gemäß DSGVO Art. 15/20. Enthält keine Passwort-Hashes und keine API-Keys (weder User- noch Admin-Keys).",
    },
    user: userDoc,
    positions,
    transactions,
    watchlist,
    priceAlerts: alerts,
    portfolioSnapshots: snapshots,
    realizedGains,
    sharedWatchlists,
    magazineAnalyses,
    newsDigests,
    rebalanceTargets,
    savedScreens,
    investmentTheses,
    usageLogs,
  };

  const filename = `ai-stock-analyzer-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
