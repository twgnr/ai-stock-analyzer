import { connectDB } from "./mongodb";
import { getAppSettings } from "./models/AppSettings";
import { decryptSecret } from "./secretCrypto";

// Reddit-Policy verlangt einen identifizierenden User-Agent. Anonyme oder
// generische UAs werden von Reddit zunehmend ratenlimitiert oder geblockt.
// Bei produktivem Einsatz auf eigenem Server: via REDDIT_USER_AGENT-Env
// überschreiben (z. B. "web:meine-app:v1 (by /u/dein-username)").
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "web:ai-stock-analyzer:v1.0 (sentiment-aggregator; respects rate limits)";

const SUBS = ["stocks", "wallstreetbets", "investing", "SecurityAnalysis", "ValueInvesting"];

/* ------------------------------------------------------------------------ */
/* OAuth                                                                    */
/* ------------------------------------------------------------------------ */

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let tokenInflight: Promise<string | null> | null = null;

/** Holt — wenn Admin-Credentials hinterlegt sind — einen Reddit-OAuth-Token
 *  via client_credentials und cached ihn im Prozess. Fällt auf null zurück,
 *  wenn keine Credentials konfiguriert sind oder Reddit den Token verweigert.
 *  Caller müssen dann den anonymen Pfad nutzen. */
async function getOAuthToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    try {
      await connectDB();
      const settings = await getAppSettings();
      const clientId = settings.dataSources?.redditClientId?.trim();
      const encryptedSecret = settings.dataSources?.redditClientSecret;
      const clientSecret = decryptSecret(encryptedSecret);
      if (!clientId || !clientSecret) return null;

      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[reddit] OAuth-Token verweigert: ${res.status} ${res.statusText}`);
        return null;
      }
      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
        token_type?: string;
      };
      if (!data.access_token) return null;
      const ttlMs = (data.expires_in ?? 3600) * 1000;
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + ttlMs,
      };
      return data.access_token;
    } catch (e) {
      console.warn("[reddit] OAuth-Token-Fetch fehlgeschlagen:", e instanceof Error ? e.message : e);
      return null;
    } finally {
      tokenInflight = null;
    }
  })();

  return tokenInflight;
}

/** Generische Mega-/Daily-Threads, die fast jeden Ticker erwähnen aber nicht
 *  ticker-spezifisch sind. Werden aus den Ergebnissen entfernt. */
const GENERIC_TITLE_PATTERNS = [
  /\bdaily.{0,20}(discussion|thread|moves|sentiment)\b/i,
  /\bweekly.{0,20}(megathread|discussion|review|recap|ideas)\b/i,
  /\bmegathread\b/i,
  /\bmoves of the day\b/i,
  /\brate my portfolio\b/i,
];

/** Reddit hat geantwortet, aber das Ergebnis war unerwartet leer/blockiert. */
export class RedditFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RedditFetchError";
    this.status = status;
  }
}

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  author: string;
  createdAt: string;
  url: string;
  permalink: string;
  selftext: string;
  upvoteRatio: number;
}

function stripExchange(ticker: string): string {
  const dot = ticker.indexOf(".");
  return dot > 0 ? ticker.slice(0, dot) : ticker;
}

function extractCoreName(fullName: string): string | null {
  if (!fullName) return null;
  const cleaned = fullName
    .replace(
      /\b(Inc|Incorporated|Corp|Corporation|Ltd|Limited|LLC|SE|AG|PLC|NV|SA|AS|Group|Holdings|Holding|Co|ADR|Company|International|Global|Technologies|Technology)\.?\s*$/gi,
      ""
    )
    .replace(/,/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3);
  return words[0] || null;
}

interface RawRedditChild {
  kind: string;
  data: {
    id: string;
    title: string;
    subreddit: string;
    score: number;
    num_comments: number;
    author: string;
    created_utc: number;
    url: string;
    permalink: string;
    selftext?: string;
    upvote_ratio?: number;
  };
}

interface RawRedditResponse {
  data?: {
    children?: RawRedditChild[];
  };
}

async function searchReddit(
  query: string,
  limit: number,
  timeframe: "day" | "week" | "month"
): Promise<RedditPost[]> {
  const subsPath = SUBS.join("+");
  const params = `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=${limit}&t=${timeframe}`;

  // OAuth-Pfad bevorzugen — höhere Limits, stabiler. Fällt auf den anonymen
  // www.reddit.com-Pfad zurück, wenn keine Credentials konfiguriert sind oder
  // der Token-Endpoint failt.
  const token = await getOAuthToken();
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  let url: string;
  if (token) {
    url = `https://oauth.reddit.com/r/${subsPath}/search${params}`;
    headers.Authorization = `Bearer ${token}`;
  } else {
    url = `https://www.reddit.com/r/${subsPath}/search.json${params}`;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    // 401 → Token wahrscheinlich abgelaufen oder vom Admin verändert. Cache
    // verwerfen, beim nächsten Call wird neu beschafft.
    if (res.status === 401 && token) {
      cachedToken = null;
    }
    // 403/429/503 sind die typischen Reddit-Rate-Limit-/Block-Codes.
    // Wir werfen einen typisierten Error, damit der Caller eine UX-Meldung
    // an den User durchreichen kann ("Reddit blockt aktuell").
    throw new RedditFetchError(
      `Reddit ${res.status} ${res.statusText} für "${query}"`,
      res.status
    );
  }
  const data: RawRedditResponse = await res.json();
  const children = data.data?.children || [];
  return children
    .filter((c) => c.kind === "t3")
    .map((c) => ({
      id: c.data.id,
      title: c.data.title,
      subreddit: c.data.subreddit,
      score: c.data.score,
      numComments: c.data.num_comments,
      author: c.data.author,
      createdAt: new Date(c.data.created_utc * 1000).toISOString(),
      url: c.data.url,
      permalink: `https://www.reddit.com${c.data.permalink}`,
      selftext: (c.data.selftext || "").slice(0, 500),
      upvoteRatio: c.data.upvote_ratio ?? 0,
    }));
}

export async function getRedditPosts(
  ticker: string,
  companyName?: string,
  limit = 15,
  timeframe: "day" | "week" | "month" = "week"
): Promise<RedditPost[]> {
  const baseTicker = stripExchange(ticker);
  // Mehrere Query-Varianten: nackter Ticker, $-prefixed Ticker (gängig auf
  // wallstreetbets), und Firmenname falls anders.
  const queries: string[] = [baseTicker, `$${baseTicker}`];
  const coreName = companyName ? extractCoreName(companyName) : null;
  if (coreName && coreName.toUpperCase() !== baseTicker.toUpperCase()) {
    queries.push(coreName);
  }

  // Promise.allSettled: eine fehlgeschlagene Query soll nicht alle anderen
  // killen. Wenn aber ALLE failen, propagieren wir einen Error nach oben.
  const results = await Promise.allSettled(
    queries.map((q) => searchReddit(q, limit, timeframe))
  );
  const successful = results.filter(
    (r): r is PromiseFulfilledResult<RedditPost[]> => r.status === "fulfilled"
  );
  if (successful.length === 0) {
    const firstFail = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    const reason = firstFail?.reason;
    if (reason instanceof RedditFetchError) throw reason;
    throw new RedditFetchError(
      reason instanceof Error ? reason.message : "Reddit nicht erreichbar"
    );
  }

  // Posts dedupen.
  const byId = new Map<string, RedditPost>();
  for (const r of successful) {
    for (const p of r.value) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
  }

  // Generische Threads (Daily/Weekly/Megathread) raus — die enthalten oft
  // alle möglichen Tickers und sind nicht aussagekräftig.
  const filtered = [...byId.values()].filter((p) => {
    return !GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(p.title));
  });

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);
}

export interface RedditSummary {
  postCount: number;
  totalScore: number;
  avgUpvoteRatio: number;
  topPosts: RedditPost[];
}

export function summarize(posts: RedditPost[], topN = 5): RedditSummary {
  if (posts.length === 0) {
    return { postCount: 0, totalScore: 0, avgUpvoteRatio: 0, topPosts: [] };
  }
  const sorted = [...posts].sort((a, b) => b.score - a.score);
  const totalScore = posts.reduce((s, p) => s + p.score, 0);
  const avgUpvoteRatio = posts.reduce((s, p) => s + p.upvoteRatio, 0) / posts.length;
  return {
    postCount: posts.length,
    totalScore,
    avgUpvoteRatio,
    topPosts: sorted.slice(0, topN),
  };
}
