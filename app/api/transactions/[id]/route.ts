import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/lib/models/Transaction";
import { RealizedGain } from "@/lib/models/RealizedGain";
import { getCurrentUser } from "@/lib/auth";
import { rebuildPosition } from "@/lib/positionService";
import { getApiTranslations } from "@/lib/i18n-server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const tx = await Transaction.findOneAndDelete({ _id: id, userId: user._id }).lean();
  if (!tx) return NextResponse.json({ error: t("resource.notFound") }, { status: 404 });

  if (tx.type === "sell") {
    await RealizedGain.deleteMany({ transactionId: id });
  }
  if (tx.type === "buy" || tx.type === "sell") {
    await rebuildPosition(user._id, tx.ticker);
  }

  return NextResponse.json({ ok: true });
}
