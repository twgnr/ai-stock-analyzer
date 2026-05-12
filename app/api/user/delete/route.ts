import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import {
  getCurrentUser,
  verifyPassword,
  clearSessionCookie,
} from "@/lib/auth";
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
import { PasswordResetToken } from "@/lib/models/PasswordResetToken";
import { EmailVerificationToken } from "@/lib/models/EmailVerificationToken";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * DSGVO-Löschung (Art. 17). Der User muss sein aktuelles Passwort
 * angeben, damit niemand über eine gekaperte Session den Account
 * vernichten kann.
 *
 * Letzten Admin verhindern wir wie im Admin-Panel — sonst gäbe es
 * keinen Zugang mehr, um neue Nutzer zu verwalten.
 */
export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json(
      { error: t("auth.passwordRequired") },
      { status: 400 }
    );
  }

  await connectDB();
  const full = await User.findById(user._id);
  if (!full) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  const ok = await verifyPassword(password, full.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: t("auth.passwordWrong") },
      { status: 401 }
    );
  }

  if (full.role === "admin") {
    const otherAdmins = await User.countDocuments({
      role: "admin",
      _id: { $ne: full._id },
    });
    if (otherAdmins === 0) {
      return NextResponse.json(
        {
          error:
            "Letzten Admin-Account kann man nicht selbst löschen. Bitte vorher einen anderen User zum Admin machen.",
        },
        { status: 400 }
      );
    }
  }

  // Alle User-eigenen Daten löschen. Bei gemeinsamen Ressourcen (z.B. geteilte
  // Magazin-Analysen oder Watchlists) werden auch die gelöscht — der User
  // hat gegenüber anderen keine Aufbewahrungspflicht. Shared-Snapshots
  // (DividendScreener, MarketMovers) sind global und enthalten nur Kursdaten,
  // daher bleiben sie.
  await Promise.all([
    Position.deleteMany({ userId: full._id }),
    Transaction.deleteMany({ userId: full._id }),
    Watchlist.deleteMany({ userId: full._id }),
    PriceAlert.deleteMany({ userId: full._id }),
    PortfolioSnapshot.deleteMany({ userId: full._id }),
    RealizedGain.deleteMany({ userId: full._id }),
    SharedWatchlist.deleteMany({ userId: full._id }),
    MagazineAnalysis.deleteMany({ userId: full._id }),
    NewsDigest.deleteMany({ userId: full._id }),
    RebalanceTarget.deleteMany({ userId: full._id }),
    SavedScreen.deleteMany({ userId: full._id }),
    UsageLog.deleteMany({ userId: full._id }),
    PasswordResetToken.deleteMany({ userId: full._id }),
    EmailVerificationToken.deleteMany({ userId: full._id }),
    InvestmentThesis.deleteMany({ userId: full._id }),
  ]);

  await User.findByIdAndDelete(full._id);
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
