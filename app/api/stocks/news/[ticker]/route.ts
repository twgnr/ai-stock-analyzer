import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/yahoo";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { ticker } = await params;
  const news = await getNews(ticker, 15);
  return NextResponse.json(news);
}
