"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Eye,
  Upload,
  Camera,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  Image as ImageIcon,
} from "lucide-react";
import { type IChartApi } from "lightweight-charts";
import { type IndicatorKey } from "@/lib/chartIndicators";

interface Pattern {
  name: string;
  confidence: "high" | "medium" | "low";
  implication: "bullish" | "bearish" | "neutral";
  description: string;
}

interface VisionResult {
  trend: "uptrend" | "downtrend" | "sideways";
  overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  summary: string;
  patterns: Pattern[];
  supportLevels: number[];
  resistanceLevels: number[];
  indicatorObservations: string[];
  keyObservations: string[];
  risks: string[];
  tradingSetup: string;
}

interface Props {
  ticker: string;
  currency: string;
  range: string;
  indicators: Set<IndicatorKey>;
  chartApi: IChartApi | null;
}

const SIGNAL_COLORS: Record<string, string> = {
  BULLISH: "text-[var(--green)] bg-green-500/10 border-green-500/30",
  BEARISH: "text-[var(--red)] bg-red-500/10 border-red-500/30",
  NEUTRAL: "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--border)]",
};

const IMPL_COLORS: Record<string, string> = {
  bullish: "text-[var(--green)] bg-green-500/10",
  bearish: "text-[var(--red)] bg-red-500/10",
  neutral: "text-[var(--muted)] bg-[var(--surface-2)]",
};

const CONF_COLORS: Record<string, string> = {
  high: "bg-[var(--green)]",
  medium: "bg-yellow-400",
  low: "bg-[var(--muted)]",
};

function SignalIcon({ signal }: { signal: string }) {
  if (signal === "BULLISH" || signal === "bullish" || signal === "uptrend")
    return <TrendingUp size={14} className="text-[var(--green)]" />;
  if (signal === "BEARISH" || signal === "bearish" || signal === "downtrend")
    return <TrendingDown size={14} className="text-[var(--red)]" />;
  return <Minus size={14} className="text-[var(--muted)]" />;
}

function canvasToBase64(canvas: HTMLCanvasElement): { base64: string; mimeType: string } {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  return { base64, mimeType: "image/png" };
}

export function ChartVisionAnalysis({ ticker, currency, range, indicators, chartApi }: Props) {
  const t = useTranslations("AnalysisPanels.indicators.vision");
  const tInd = useTranslations("AnalysisPanels.indicators");
  const tCommon = useTranslations("AnalysisPanels.common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "upload" | null>(null);

  async function analyzeExisting() {
    if (!chartApi) {
      setError(t("errorNotReady"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setMode("existing");
    try {
      const canvas = chartApi.takeScreenshot();
      const { base64, mimeType } = canvasToBase64(canvas);
      setPreviewUrl(`data:${mimeType};base64,${base64}`);

      const res = await fetch("/api/analyze/chart-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          imageMime: mimeType,
          ticker,
          range,
          indicators: [...indicators],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }

  async function analyzeUpload(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setMode("upload");
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const form = new FormData();
      form.append("image", file);
      form.append("ticker", ticker);
      form.append("range", range);
      form.append("indicators", [...indicators].join(","));

      const res = await fetch("/api/analyze/chart-vision", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("errorFileType"));
      return;
    }
    analyzeUpload(file);
    e.target.value = "";
  }

  const signalLabel = (signal: string) => {
    if (signal === "BULLISH" || signal === "BEARISH" || signal === "NEUTRAL") {
      return tInd(`signals.${signal}` as "signals.BULLISH" | "signals.BEARISH" | "signals.NEUTRAL");
    }
    return signal;
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Eye size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-[var(--muted)]">{t("intro")}</p>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={analyzeExisting}
          disabled={loading || !chartApi}
          className="btn btn-primary"
          title={t("tooltipCurrent")}
        >
          {loading && mode === "existing" ? (
            <div className="spinner" />
          ) : (
            <Camera size={14} />
          )}
          {loading && mode === "existing" ? t("analyzingCurrent") : t("analyzeCurrent")}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="btn"
        >
          {loading && mode === "upload" ? <div className="spinner" /> : <Upload size={14} />}
          {loading && mode === "upload" ? t("analyzingUpload") : t("uploadImage")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          className="hidden"
        />
      </div>

      {error && (
        <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {previewUrl && !loading && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted)] flex items-center gap-1">
            <ImageIcon size={12} /> {t("showImage")}
          </summary>
          <img
            src={previewUrl}
            alt={t("imageAlt")}
            className="mt-2 max-w-full rounded border border-[var(--border)]"
          />
        </details>
      )}

      {result && (
        <div className="space-y-4 pt-2 border-t border-[var(--border)]">
          <div
            className={`rounded-md p-3 border flex items-start gap-3 ${SIGNAL_COLORS[result.overallSignal] || SIGNAL_COLORS.NEUTRAL}`}
          >
            <SignalIcon signal={result.overallSignal} />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{signalLabel(result.overallSignal)}</span>
                <span className="text-xs">
                  {t("trendLabel", {
                    trend: t(`trends.${result.trend}` as "trends.uptrend" | "trends.downtrend" | "trends.sideways"),
                  })}
                </span>
                <span className="text-xs">
                  · {tInd("confidence", { pct: Math.round(result.confidence * 100) })}
                </span>
              </div>
              <p className="text-sm mt-1">{result.summary}</p>
            </div>
          </div>

          {result.patterns.length > 0 && (
            <div>
              <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
                {t("patterns")}
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {result.patterns.map((p, i) => (
                  <div
                    key={i}
                    className="border border-[var(--border)] rounded-md p-3 bg-[var(--surface-2)]/50"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${CONF_COLORS[p.confidence]}`} />
                        {p.name}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${IMPL_COLORS[p.implication]}`}
                      >
                        <SignalIcon signal={p.implication} />
                        {p.implication}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">
                      {t("patternConfidence", { value: p.confidence })}
                    </div>
                    <p className="text-xs leading-relaxed">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(result.supportLevels.length > 0 || result.resistanceLevels.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {result.supportLevels.length > 0 && (
                <div>
                  <h3 className="text-xs text-[var(--green)] uppercase tracking-wider mb-1">
                    {t("support")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.supportLevels.map((l, i) => (
                      <span
                        key={i}
                        className="text-sm num px-2 py-1 rounded border border-green-500/30 bg-green-500/5"
                      >
                        {l.toFixed(2)} {currency}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.resistanceLevels.length > 0 && (
                <div>
                  <h3 className="text-xs text-[var(--red)] uppercase tracking-wider mb-1">
                    {t("resistance")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.resistanceLevels.map((l, i) => (
                      <span
                        key={i}
                        className="text-sm num px-2 py-1 rounded border border-red-500/30 bg-red-500/5"
                      >
                        {l.toFixed(2)} {currency}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.indicatorObservations.length > 0 && (
            <div>
              <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                {t("indicatorObservations")}
              </h3>
              <ul className="text-sm space-y-1">
                {result.indicatorObservations.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--accent)]">•</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {result.keyObservations.length > 0 && (
              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t("observations")}
                </h3>
                <ul className="text-sm space-y-1">
                  {result.keyObservations.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--accent)]">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.risks.length > 0 && (
              <div>
                <h3 className="text-xs text-[var(--red)] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> {t("risks")}
                </h3>
                <ul className="text-sm space-y-1">
                  {result.risks.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--red)]">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.tradingSetup && (
            <div className="border-t border-[var(--border)] pt-3">
              <h3 className="text-xs text-[var(--accent)] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Target size={12} /> {t("tradeSetup")}
              </h3>
              <p className="text-sm">{result.tradingSetup}</p>
            </div>
          )}

          <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
            {t("disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}
