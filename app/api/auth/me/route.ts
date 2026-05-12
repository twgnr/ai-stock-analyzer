import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  const res = user
    ? NextResponse.json({
        user: {
          _id: user.userId,
          email: user.email,
          name: user.name,
          baseCurrency: user.baseCurrency,
          hasClaudeKey: !!user.claudeApiKey,
          role: user.role,
          emailVerified: user.emailVerified,
        },
      })
    : NextResponse.json({ user: null });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return res;
}
