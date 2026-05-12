"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Sparkles, ArrowLeft, AlertCircle, Newspaper, Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { type IChartApi } from "lightweight-charts";
import { Chart, type Candle } from "@/components/Chart";
import { IndicatorSelector } from "@/components/IndicatorSelector";
import { ChartIndicatorAnalysis } from "@/components/ChartIndicatorAnalysis";
import { ChartVisionAnalysis } from "@/components/ChartVisionAnalysis";
import { type IndicatorKey } from "@/lib/chartIndicators";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { WatchlistButton } from "@/components/WatchlistButton";
import { RedditPanel } from "@/components/RedditPanel";
import { StocktwitsPanel } from "@/components/StocktwitsPanel";
import { WikipediaAttentionPanel } from "@/components/WikipediaAttentionPanel";
import { GoogleTrendsPanel } from "@/components/GoogleTrendsPanel";
import { PositionSizingPanel } from "@/components/PositionSizingPanel";
import { RelationshipMap } from "@/components/RelationshipMap";
import { ConsensusPanel } from "@/components/ConsensusPanel";
import { EarningsReactionPanel } from "@/components/EarningsReactionPanel";
import { InsiderPanel } from "@/components/InsiderPanel";
import { ProScoresPanel } from "@/components/ProScoresPanel";
import { DcfPanel } from "@/components/DcfPanel";
import { FundamentalsDeepPanel } from "@/components/FundamentalsDeepPanel";
import { BullBearPanel } from "@/components/BullBearPanel";
import { ThesisPanel } from "@/components/ThesisPanel";
import { NotesPanel } from "@/components/NotesPanel";
import { FollowUpButton } from "@/components/FollowUpButton";
import { fmtCurrency, fmtPercent, fmtNumber, changeClass } from "@/lib/format";
import { addRecentTicker } from "@/lib/recentTickers";

const RANGES: Array<{ value: string; label: string }> = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1J" },
  { value: "2y", label: "2J" },
  { value: "5y", label: "5J" },
];

interface Quote {
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  exchange?: string;
}

interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
}

interface Fundamentals {
  sector?: string;
  industry?: string;
  country?: string;
  businessSummary?: string;
  peRatio?: number;
  forwardPe?: number;
  dividendYield?: number;
  marketCap?: number;
  beta?: number;
  profitMargin?: number;
  recommendationMean?: number;
  recommendationKey?: string;
  targetMeanPrice?: number;
  numberOfAnalysts?: number;
}

interface Analysis {
  recommendation: "BUY" | "HOLD" | "SELL" | "REDUCE" | "ACCUMULATE";
  confidence: number;
  summary: string;
  reasoning: string;
  risks: string[];
  opportunities: string[];
  priceTargets?: { low?: number; base?: number; high?: number };
  suggestedAllocation?: string;
  sourcesUsed?: string[];
  model?: string;
}

export default function AnalysisPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params);
  const ticker = decodeURIComponent(rawTicker);
  const t = useTranslations("Analysis");
  const locale = useLocale();
  const localeForDate = locale === "de" ? "de-DE" : "en-US";
  const localeForNumber = locale === "de" ? "de-DE" : "en-US";

  const [quote, setQuote] = useState<Quote | null>(null);
  const [fxRate, setFxRate] = useState<number>(1);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [range, setRange] = useState("6mo");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set());
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai-stock-analyzer:chart:indicators:v1");
      if (saved) {
        const arr = JSON.parse(saved) as IndicatorKey[];
        setActiveIndicators(new Set(arr));
      }
    } catch {}
  }, []);

  function updateIndicators(next: Set<IndicatorKey>) {
    setActiveIndicators(next);
    try {
      localStorage.setItem(
        "ai-stock-analyzer:chart:indicators:v1",
        JSON.stringify([...next])
      );
    } catch {}
  }

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, nRes, fRes] = await Promise.all([
        fetch(`/api/stocks/quote?tickers=${encodeURIComponent(ticker)}`),
        fetch(`/api/stocks/news/${encodeURIComponent(ticker)}`),
        fetch(`/api/stocks/fundamentals/${encodeURIComponent(ticker)}`),
      ]);
      const quotes = await qRes.json();
      if (!quotes || quotes.length === 0) throw new Error(t("errorNoQuote", { ticker }));
      const q0: Quote = quotes[0];
      setQuote(q0);
      setNews(await nRes.json());
      setFundamentals(await fRes.json());

      const cur = (q0.currency || "").toUpperCase();
      if (cur && cur !== "EUR") {
        try {
          const fxRes = await fetch(`/api/fx?currencies=${encodeURIComponent(cur)}`);
          const fxData = (await fxRes.json()) as { base: string; rates: Record<string, number> };
          const r = fxData?.rates?.[cur];
          setFxRate(typeof r === "number" && r > 0 ? r : 1);
        } catch {
          setFxRate(1);
        }
      } else {
        setFxRate(1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [ticker, t]);

  const loadChart = useCallback(async () => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/stocks/chart/${encodeURIComponent(ticker)}?range=${range}`);
      setCandles(await res.json());
    } finally {
      setChartLoading(false);
    }
  }, [ticker, range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  // Recently-Viewed-Liste pflegen — sobald wir den Quote-Namen haben, mit
  // diesem speichern, sonst nur mit Ticker. Beim Re-Visit wird der Eintrag
  // nach vorne sortiert.
  useEffect(() => {
    if (!ticker) return;
    addRecentTicker(ticker, quote?.name);
  }, [ticker, quote?.name]);

  const displayCandles = useMemo(() => {
    if (fxRate === 1 || candles.length === 0) return candles;
    return candles.map((c) => ({
      ...c,
      open: c.open * fxRate,
      high: c.high * fxRate,
      low: c.low * fxRate,
      close: c.close * fxRate,
    }));
  }, [candles, fxRate]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("ai.errorFailed"));
      setAnalysis(data);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : t("ai.errorFailed"));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-white inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          <div>{t("loading", { ticker })}</div>
        </div>
      ) : error ? (
        <div className="card p-4 text-[var(--red)] flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : quote ? (
        <>
          <div className="card p-4 flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">{quote.ticker}</h1>
                <span className="text-[var(--muted)]">{quote.name}</span>
                {quote.exchange && (
                  <span className="text-xs text-[var(--muted)] px-2 py-0.5 border border-[var(--border)] rounded">
                    {quote.exchange}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-2 flex-wrap">
                <span className="text-3xl font-semibold num">
                  {fmtCurrency(quote.price * fxRate, "EUR")}
                </span>
                {quote.currency?.toUpperCase() !== "EUR" && (
                  <span className="text-sm text-[var(--muted)] num">
                    ({fmtCurrency(quote.price, quote.currency)})
                  </span>
                )}
                <span className={`num ${changeClass(quote.change)}`}>
                  {quote.change >= 0 ? "+" : ""}
                  {fmtNumber(quote.change * fxRate, localeForNumber)} ({fmtPercent(quote.changePercent)})
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <WatchlistButton ticker={quote.ticker} name={quote.name} size="sm" />
                <Link
                  href={{
                    pathname: "/alerts",
                    query: {
                      new: "1",
                      ticker: quote.ticker,
                      // Werte in EUR durchreichen — die Alerts-Seite arbeitet
                      // standardmäßig in EUR. Wer das später ändern will,
                      // schaltet die Währung im Formular um.
                      price: (quote.price * fxRate).toFixed(2),
                      currency: "EUR",
                      // Standard-Vorschlag: +5 % über aktuellem Kurs (Breakout-
                      // Trigger). Der User kann das im Formular jederzeit ändern.
                      threshold: (quote.price * fxRate * 1.05).toFixed(2),
                      direction: "above",
                    },
                  }}
                  className="btn text-sm"
                  title={t("header.createAlertTitle")}
                >
                  <Bell size={13} aria-hidden="true" />
                  {t("header.createAlert")}
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {quote.dayLow != null && quote.dayHigh != null && (
                <>
                  <span className="text-[var(--muted)]">{t("header.dayHigh")}</span>
                  <span className="num text-right">{fmtCurrency(quote.dayHigh * fxRate, "EUR")}</span>
                  <span className="text-[var(--muted)]">{t("header.dayLow")}</span>
                  <span className="num text-right">{fmtCurrency(quote.dayLow * fxRate, "EUR")}</span>
                </>
              )}
              {quote.fiftyTwoWeekLow != null && quote.fiftyTwoWeekHigh != null && (
                <>
                  <span className="text-[var(--muted)]">{t("header.weekHigh52")}</span>
                  <span className="num text-right">{fmtCurrency(quote.fiftyTwoWeekHigh * fxRate, "EUR")}</span>
                  <span className="text-[var(--muted)]">{t("header.weekLow52")}</span>
                  <span className="num text-right">{fmtCurrency(quote.fiftyTwoWeekLow * fxRate, "EUR")}</span>
                </>
              )}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="font-semibold">{t("chart.title")}</h2>
                <span className="text-xs text-[var(--muted)]">
                  {fxRate !== 1 ? t("chart.noteFx") : t("chart.noteEur")}
                </span>
              </div>
              <div className="flex gap-2 items-start flex-wrap">
                <div className="flex gap-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRange(r.value)}
                      className={`px-3 py-1 text-xs rounded ${
                        range === r.value
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <IndicatorSelector
                  active={activeIndicators}
                  onChange={updateIndicators}
                />
              </div>
            </div>
            {chartLoading ? (
              <div className="h-[400px] flex items-center justify-center text-[var(--muted)]">
                <div className="spinner" />
              </div>
            ) : displayCandles.length > 0 ? (
              <Chart
                candles={displayCandles}
                indicators={activeIndicators}
                onChartReady={(c) => setChartApi(c)}
              />
            ) : (
              <div className="h-[400px] flex items-center justify-center text-[var(--muted)]">
                {t("chart.empty")}
              </div>
            )}
          </div>

          <ChartIndicatorAnalysis
            ticker={quote.ticker}
            range={range}
            indicators={activeIndicators}
          />

          <ChartVisionAnalysis
            ticker={quote.ticker}
            currency={quote.currency}
            range={range}
            indicators={activeIndicators}
            chartApi={chartApi}
          />

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--accent)]" />
                <h2 className="font-semibold">{t("ai.title")}</h2>
              </div>
              <button onClick={runAnalysis} disabled={analyzing} className="btn btn-primary">
                {analyzing ? <div className="spinner" /> : <Sparkles size={14} />}
                {analyzing ? t("ai.analyzing") : analysis ? t("ai.rerun") : t("ai.run")}
              </button>
            </div>
            {analyzeError && (
              <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}
            {analysis && (
              <div className="space-y-4 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center gap-3 flex-wrap">
                  <RecommendationBadge recommendation={analysis.recommendation} />
                  <span className="text-xs text-[var(--muted)]">
                    {t("ai.confidence", { pct: fmtNumber(analysis.confidence * 100, localeForNumber, 0) })}
                  </span>
                  {analysis.model && (
                    <span className="text-xs text-[var(--muted)]">{t("ai.model", { model: analysis.model })}</span>
                  )}
                </div>
                <p className="text-sm font-medium">{analysis.summary}</p>
                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{t("ai.reasoning")}</div>
                  <p className="text-sm leading-relaxed">{analysis.reasoning}</p>
                </div>
                {analysis.priceTargets && (
                  <div>
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                      {t("ai.priceTargets")}
                    </div>
                    <div className="flex gap-6 text-sm num">
                      {analysis.priceTargets.low != null && (
                        <div>
                          <div className="text-xs text-[var(--muted)]">{t("ai.low")}</div>
                          <div>{fmtCurrency(analysis.priceTargets.low * fxRate, "EUR")}</div>
                        </div>
                      )}
                      {analysis.priceTargets.base != null && (
                        <div>
                          <div className="text-xs text-[var(--muted)]">{t("ai.base")}</div>
                          <div>{fmtCurrency(analysis.priceTargets.base * fxRate, "EUR")}</div>
                        </div>
                      )}
                      {analysis.priceTargets.high != null && (
                        <div>
                          <div className="text-xs text-[var(--muted)]">{t("ai.high")}</div>
                          <div>{fmtCurrency(analysis.priceTargets.high * fxRate, "EUR")}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  {analysis.opportunities?.length > 0 && (
                    <ListBlock
                      title={t("ai.opportunities")}
                      items={analysis.opportunities}
                      color="text-[var(--green)]"
                      followUpContext={{
                        ticker,
                        originalSummary: buildFollowUpContext(analysis, {
                          recommendation: t("ai.followUp.recommendation"),
                          summary: t("ai.followUp.summary"),
                          reasoning: t("ai.followUp.reasoning"),
                          risks: t("ai.followUp.risks"),
                          opportunities: t("ai.followUp.opportunities"),
                        }),
                      }}
                    />
                  )}
                  {analysis.risks?.length > 0 && (
                    <ListBlock
                      title={t("ai.risks")}
                      items={analysis.risks}
                      color="text-[var(--red)]"
                      followUpContext={{
                        ticker,
                        originalSummary: buildFollowUpContext(analysis, {
                          recommendation: t("ai.followUp.recommendation"),
                          summary: t("ai.followUp.summary"),
                          reasoning: t("ai.followUp.reasoning"),
                          risks: t("ai.followUp.risks"),
                          opportunities: t("ai.followUp.opportunities"),
                        }),
                      }}
                    />
                  )}
                </div>
                {analysis.suggestedAllocation && (
                  <div>
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                      {t("ai.positionSize")}
                    </div>
                    <p className="text-sm">{analysis.suggestedAllocation}</p>
                  </div>
                )}
                <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
                  {t("ai.disclaimer")}
                </p>
              </div>
            )}
          </div>

          {fundamentals && (
            <div className="card p-4 space-y-3">
              <h2 className="font-semibold">{t("fundamentals.title")}</h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                {fundamentals.sector && <KV k={t("fundamentals.sector")} v={fundamentals.sector} />}
                {fundamentals.industry && <KV k={t("fundamentals.industry")} v={fundamentals.industry} />}
                {fundamentals.country && <KV k={t("fundamentals.country")} v={fundamentals.country} />}
                {fundamentals.marketCap != null && (
                  <KV k={t("fundamentals.marketCap")} v={fmtMarketCap(fundamentals.marketCap * fxRate, "EUR", locale)} />
                )}
                {fundamentals.peRatio != null && (
                  <KV k={t("fundamentals.peTtm")} v={fmtNumber(fundamentals.peRatio, localeForNumber, 1)} />
                )}
                {fundamentals.forwardPe != null && (
                  <KV k={t("fundamentals.peFwd")} v={fmtNumber(fundamentals.forwardPe, localeForNumber, 1)} />
                )}
                {fundamentals.dividendYield != null && (
                  <KV k={t("fundamentals.dividendYield")} v={fmtPercent(fundamentals.dividendYield * 100)} />
                )}
                {fundamentals.beta != null && (
                  <KV k={t("fundamentals.beta")} v={fmtNumber(fundamentals.beta, localeForNumber, 2)} />
                )}
                {fundamentals.profitMargin != null && (
                  <KV k={t("fundamentals.profitMargin")} v={fmtPercent(fundamentals.profitMargin * 100)} />
                )}
                {fundamentals.targetMeanPrice != null && (
                  <KV
                    k={t("fundamentals.analystTarget")}
                    v={fmtCurrency(fundamentals.targetMeanPrice * fxRate, "EUR")}
                  />
                )}
                {fundamentals.recommendationKey && (
                  <KV k={t("fundamentals.analystRec")} v={fundamentals.recommendationKey.toUpperCase()} />
                )}
              </div>
              {fundamentals.businessSummary && (
                <p className="text-sm text-[var(--muted)] pt-2 border-t border-[var(--border)]">
                  {fundamentals.businessSummary.slice(0, 400)}
                  {fundamentals.businessSummary.length > 400 ? "..." : ""}
                </p>
              )}
            </div>
          )}

          <PositionSizingPanel ticker={quote.ticker} currency={quote.currency} />

          <ConsensusPanel ticker={quote.ticker} />

          <EarningsReactionPanel ticker={quote.ticker} />

          <InsiderPanel ticker={quote.ticker} currency={quote.currency} />

          <ProScoresPanel ticker={quote.ticker} />

          <DcfPanel ticker={quote.ticker} currency={quote.currency} />

          <FundamentalsDeepPanel ticker={quote.ticker} currency={quote.currency} />

          <BullBearPanel ticker={quote.ticker} currency={quote.currency} />

          <ThesisPanel ticker={quote.ticker} currency={quote.currency} priceAtEntry={quote.price} />

          <NotesPanel ticker={quote.ticker} />

          <RelationshipMap ticker={quote.ticker} centerName={quote.name} />

          <div className="grid lg:grid-cols-2 gap-4">
            <WikipediaAttentionPanel ticker={quote.ticker} />
            <GoogleTrendsPanel ticker={quote.ticker} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <RedditPanel ticker={quote.ticker} />
            <StocktwitsPanel ticker={quote.ticker} />
          </div>

          {news.length > 0 && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Newspaper size={16} />
                <h2 className="font-semibold">{t("news.title")}</h2>
              </div>
              <div className="space-y-2">
                {news.slice(0, 10).map((n, i) => (
                  <a
                    key={i}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block card-hover p-3 rounded-md border border-[var(--border)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-sm">{n.title}</div>
                      <div className="text-xs text-[var(--muted)] flex-shrink-0">
                        {new Date(n.publishedAt).toLocaleDateString(localeForDate)}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1">{n.publisher}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <div className="text-[var(--muted)]">{k}</div>
      <div className="num">{v}</div>
    </>
  );
}

function buildFollowUpContext(
  a: {
    summary?: string;
    reasoning?: string;
    recommendation?: string;
    risks?: string[];
    opportunities?: string[];
  },
  labels: {
    recommendation: string;
    summary: string;
    reasoning: string;
    risks: string;
    opportunities: string;
  }
): string {
  const parts: string[] = [];
  if (a.recommendation) parts.push(`${labels.recommendation}: ${a.recommendation}`);
  if (a.summary) parts.push(`${labels.summary}: ${a.summary}`);
  if (a.reasoning) parts.push(`${labels.reasoning}: ${a.reasoning}`);
  if (a.risks && a.risks.length > 0)
    parts.push(`${labels.risks}: ${a.risks.join("; ")}`);
  if (a.opportunities && a.opportunities.length > 0)
    parts.push(`${labels.opportunities}: ${a.opportunities.join("; ")}`);
  return parts.join("\n");
}

function ListBlock({
  title,
  items,
  color,
  followUpContext,
}: {
  title: string;
  items: string[];
  color?: string;
  followUpContext?: { ticker: string; originalSummary: string };
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{title}</div>
      <ul className="text-sm space-y-1">
        {items.map((it, i) => (
          <li key={i} className="space-y-1">
            <div className="flex gap-2">
              <span className={color || "text-[var(--accent)]"}>•</span>
              <span className="flex-1">{it}</span>
            </div>
            {followUpContext && (
              <div className="ml-4">
                <FollowUpButton
                  topic={`${title}: ${it}`}
                  originalSummary={followUpContext.originalSummary}
                  ticker={followUpContext.ticker}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtMarketCap(value: number, currency: string, locale: string): string {
  const isDe = locale === "de";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} ${isDe ? "Bio." : "T"} ${currency}`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} ${isDe ? "Mrd." : "B"} ${currency}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} ${isDe ? "Mio." : "M"} ${currency}`;
  return fmtCurrency(value, currency);
}
