const USER_AGENT = "web:ai-stock-analyzer:v1.0 (by /u/anonymous)";
const SUBS = ["stocks", "wallstreetbets", "investing", "SecurityAnalysis", "ValueInvesting"];

function stripExchange(ticker) {
  const dot = ticker.indexOf(".");
  return dot > 0 ? ticker.slice(0, dot) : ticker;
}

function extractCoreName(fullName) {
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

async function searchReddit(query, limit, timeframe) {
  const subsPath = SUBS.join("+");
  const url = `https://www.reddit.com/r/${subsPath}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=${limit}&t=${timeframe}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data?.children || []).filter(c => c.kind === "t3").map(c => ({
    id: c.data.id,
    title: c.data.title,
    subreddit: c.data.subreddit,
    score: c.data.score,
    selftext: (c.data.selftext || "").slice(0, 500),
  }));
}

async function test(ticker, name) {
  const baseTicker = stripExchange(ticker);
  const core = extractCoreName(name);
  const queries = [baseTicker];
  if (core && core.toUpperCase() !== baseTicker.toUpperCase()) queries.push(core);
  console.log(`\n=== ${ticker} (${name}) ===`);
  console.log(`Queries: ${queries.join(", ")}`);

  const byId = new Map();
  const results = await Promise.all(queries.map(q => searchReddit(q, 15, "week")));
  for (const posts of results) {
    for (const p of posts) if (!byId.has(p.id)) byId.set(p.id, p);
  }
  console.log(`Unique posts: ${byId.size}`);

  const tickerLower = baseTicker.toLowerCase();
  const coreLower = core?.toLowerCase();
  const filtered = [...byId.values()].filter(p => {
    const text = (p.title + " " + p.selftext).toLowerCase();
    if (text.includes(tickerLower)) return true;
    if (coreLower && text.includes(coreLower)) return true;
    return false;
  });
  console.log(`Filtered: ${filtered.length}`);
  console.log("Top 5:");
  filtered.sort((a, b) => b.score - a.score).slice(0, 5).forEach(p => {
    console.log(`  [${p.subreddit}] ${p.score}↑ ${p.title.slice(0, 80)}`);
  });
}

await test("NVDA", "NVIDIA Corporation");
await test("TSLA", "Tesla, Inc.");
await test("SAP.DE", "SAP SE");
