import { NextRequest, NextResponse } from "next/server";
import { getFundamentals } from "@/lib/yahoo";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { ticker } = await params;
  const data = await getFundamentals(ticker);
  return NextResponse.json(data);
}
