import { NextRequest, NextResponse } from "next/server";
import { getRedditPosts, RedditFetchError } from "@/lib/reddit";
import { getQuote } from "@/lib/yahoo";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { ticker } = await params;
  const timeframe = req.nextUrl.searchParams.get("timeframe") as
    | "day"
    | "week"
    | "month"
    | null;

  let companyName: string | undefined;
  try {
    const quote = await getQuote(ticker);
    companyName = quote.name;
  } catch {
    // ignore, search funktioniert auch nur mit dem Ticker.
  }

  try {
    const posts = await getRedditPosts(
      ticker,
      companyName,
      20,
      timeframe || "week"
    );
    // Backwards-kompatibel: wenn der alte Frontend-Code einen Array erwartet,
    // war das ok. Neuer Frontend-Code akzeptiert beides. Wir nutzen jetzt das
    // Objekt-Format, damit wir Diagnose-Info mitliefern können.
    return NextResponse.json({ posts, query: companyName ?? ticker });
  } catch (e) {
    if (e instanceof RedditFetchError) {
      console.warn("[reddit-api]", e.message);
      const message =
        e.status === 429 || e.status === 403
          ? "Reddit ratenlimitiert oder blockiert die Anfrage. Probier es später erneut, oder hinterlege in den Server-Env einen eigenen REDDIT_USER_AGENT mit deinem Reddit-Username."
          : `Reddit nicht erreichbar (${e.status ?? "Netzwerkfehler"}).`;
      return NextResponse.json(
        { posts: [], reason: message, status: e.status ?? 0 },
        { status: 200 }
      );
    }
    console.error("[reddit-api]", e);
    return NextResponse.json(
      {
        posts: [],
        reason: e instanceof Error ? e.message : "Unbekannter Fehler",
        status: 500,
      },
      { status: 200 }
    );
  }
}
