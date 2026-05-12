import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
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
import { PasswordResetToken } from "@/lib/models/PasswordResetToken";
import { EmailVerificationToken } from "@/lib/models/EmailVerificationToken";
import { InvestmentThesis } from "@/lib/models/InvestmentThesis";
import { UsageLog } from "@/lib/models/UsageLog";
import { requireAdmin, AuthError, generateToken } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { apiErrorResponse } from "@/lib/apiError";
import { getApiTranslations, getEmailTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const t = await getApiTranslations();
    const admin = await requireAdmin();
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const target = await User.findById(id);
    if (!target) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

    if (typeof body.role === "string" && (body.role === "user" || body.role === "admin")) {
      if (String(target._id) === admin.userId && body.role !== "admin") {
        const otherAdmins = await User.countDocuments({
          role: "admin",
          _id: { $ne: admin.userId },
        });
        if (otherAdmins === 0) {
          return NextResponse.json(
            { error: "Letzten Admin kann man nicht degradieren" },
            { status: 400 }
          );
        }
      }
      target.role = body.role;
    }
    if (typeof body.emailVerified === "boolean") {
      target.emailVerified = body.emailVerified;
    }
    const wasApprovedBefore = target.approved !== false;
    if (typeof body.approved === "boolean") {
      target.approved = body.approved;
    }
    await target.save();

    const freshlyApproved =
      typeof body.approved === "boolean" &&
      body.approved === true &&
      !wasApprovedBefore;
    if (freshlyApproved) {
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const loginUrl = `${appUrl}/login`;
      const tMail = await getEmailTranslations(target.locale);
      const greeting = target.name
        ? tMail("accountApproved.greetingNamed", { name: target.name })
        : tMail("accountApproved.greeting");
      const lines = [
        greeting,
        "",
        tMail("accountApproved.intro"),
        "",
        loginUrl,
      ];
      if (!target.emailVerified) {
        lines.push("", tMail("accountApproved.verifyHint"));
      }
      lines.push("", tMail("common.signature"));
      // Best-effort, kein harter Fehler falls SMTP weg
      sendMail({
        to: target.notificationEmail || target.email,
        subject: tMail("accountApproved.subject"),
        text: lines.join("\n"),
      }).catch((e) => {
        console.error("[admin/user approve] mail failed", e instanceof Error ? e.message : e);
      });
    }

    return NextResponse.json({
      _id: String(target._id),
      email: target.email,
      role: target.role,
      emailVerified: target.emailVerified,
      approved: target.approved,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return apiErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const t = await getApiTranslations();
    const admin = await requireAdmin();
    await connectDB();
    const { id } = await params;

    if (id === admin.userId) {
      return NextResponse.json(
        { error: "Eigenen Account kann man nicht löschen" },
        { status: 400 }
      );
    }

    const target = await User.findById(id);
    if (!target) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

    if (target.role === "admin") {
      const otherAdmins = await User.countDocuments({ role: "admin", _id: { $ne: id } });
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "Letzten Admin kann man nicht löschen" },
          { status: 400 }
        );
      }
    }

    // DSGVO Art. 17 — alle user-bezogenen Daten vollständig entfernen.
    await Promise.all([
      Position.deleteMany({ userId: target._id }),
      Transaction.deleteMany({ userId: target._id }),
      Watchlist.deleteMany({ userId: target._id }),
      PriceAlert.deleteMany({ userId: target._id }),
      PortfolioSnapshot.deleteMany({ userId: target._id }),
      RealizedGain.deleteMany({ userId: target._id }),
      SharedWatchlist.deleteMany({ userId: target._id }),
      MagazineAnalysis.deleteMany({ userId: target._id }),
      NewsDigest.deleteMany({ userId: target._id }),
      RebalanceTarget.deleteMany({ userId: target._id }),
      SavedScreen.deleteMany({ userId: target._id }),
      InvestmentThesis.deleteMany({ userId: target._id }),
      PasswordResetToken.deleteMany({ userId: target._id }),
      EmailVerificationToken.deleteMany({ userId: target._id }),
      UsageLog.deleteMany({ userId: target._id }),
    ]);
    await User.findByIdAndDelete(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return apiErrorResponse(e);
  }
}
