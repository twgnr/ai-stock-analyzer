"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type Time,
  type ISeriesApi,
} from "lightweight-charts";
import {
  computeSMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeAwesomeOscillator,
  computeAroon,
  computeCCI,
  computeMomentum,
  computeOBOS,
  computeDI,
  computeFastStochastic,
  computeIchimoku,
  computeRSL,
  computeAnchoredVWAP,
  computeOBV,
  computeMFI,
  type IndicatorKey,
} from "@/lib/chartIndicators";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  candles: Candle[];
  height?: number;
  indicators?: Set<IndicatorKey>;
  onChartReady?: (chart: IChartApi) => void;
}

const COLORS = {
  sma20: "#3b82f6",
  sma50: "#f59e0b",
  sma200: "#ef4444",
  bbUpper: "#a855f7",
  bbLower: "#a855f7",
  bbMid: "#a855f7",
  ikhTenkan: "#3b82f6",
  ikhKijun: "#ef4444",
  ikhSpanA: "#22c55e",
  ikhSpanB: "#ef4444",
  rsi: "#eab308",
  macd: "#3b82f6",
  macdSignal: "#ef4444",
  macdHist: "rgba(148, 163, 184, 0.5)",
  aos: "#22c55e",
  aro: "#a855f7",
  cci: "#06b6d4",
  mom: "#f97316",
  obos: "#ec4899",
  diPlus: "#22c55e",
  diMinus: "#ef4444",
  fstocK: "#3b82f6",
  fstocD: "#ef4444",
  rsl: "#a855f7",
  avwap: "#f59e0b",
  obv: "#06b6d4",
  mfi: "#a855f7",
};

export function Chart({ candles, height = 400, indicators = new Set(), onChartReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || candles.length === 0) return;

    // Determine oscillator panes needed (1 pane per active oscillator indicator)
    const oscillatorKeys: IndicatorKey[] = [
      "RSI",
      "MACD",
      "AOS",
      "ARO",
      "CCI",
      "MOM",
      "OBOS",
      "DIX",
      "FSTOC",
      "RSL",
      "MFI",
      "OBV",
    ];
    const activeOscillators = oscillatorKeys.filter((k) => indicators.has(k));
    const totalPanes = 1 + activeOscillators.length;

    // Heights: main gets >= 60%, each oscillator shares the rest
    const mainHeight = Math.max(
      240,
      Math.floor((height - activeOscillators.length * 80))
    );
    const oscHeight = 80;
    const totalHeight = mainHeight + activeOscillators.length * oscHeight;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: totalHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#12141a" },
        textColor: "#8a8f9a",
      },
      grid: {
        vertLines: { color: "#1a1d26" },
        horzLines: { color: "#1a1d26" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#262a35" },
      timeScale: { borderColor: "#262a35", timeVisible: true, secondsVisible: false },
    });

    const times = candles.map((c) => c.time as Time);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // --- MAIN PANE: Candlesticks + Overlays ---
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#3b82f6",
    });
    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
      }))
    );

    const addLineOverlay = (
      values: (number | null)[],
      color: string,
      title: string,
      lineWidth: 1 | 2 = 1
    ) => {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        title,
      });
      const data = values
        .map((v, i) => (v !== null ? { time: times[i], value: v } : null))
        .filter((x): x is { time: Time; value: number } => x !== null);
      s.setData(data);
      return s;
    };

    if (indicators.has("SMA20")) addLineOverlay(computeSMA(closes, 20), COLORS.sma20, "SMA20");
    if (indicators.has("SMA50")) addLineOverlay(computeSMA(closes, 50), COLORS.sma50, "SMA50");
    if (indicators.has("SMA200")) addLineOverlay(computeSMA(closes, 200), COLORS.sma200, "SMA200");

    if (indicators.has("BB")) {
      const bb = computeBollingerBands(closes);
      addLineOverlay(bb.upper, COLORS.bbUpper, "BB Upper");
      addLineOverlay(bb.middle, COLORS.bbMid, "BB Middle");
      addLineOverlay(bb.lower, COLORS.bbLower, "BB Lower");
    }

    if (indicators.has("AVWAP")) {
      // Anker = erste Kerze im Chart-Fenster
      const vols = candles.map((c) => c.volume);
      addLineOverlay(
        computeAnchoredVWAP(highs, lows, closes, vols, 0),
        COLORS.avwap,
        "Anchored VWAP",
        2
      );
    }

    if (indicators.has("IKH")) {
      const ikh = computeIchimoku(highs, lows);
      addLineOverlay(ikh.conv, COLORS.ikhTenkan, "Tenkan (9)");
      addLineOverlay(ikh.base, COLORS.ikhKijun, "Kijun (26)");
      addLineOverlay(ikh.spanA, COLORS.ikhSpanA, "Senkou A");
      addLineOverlay(ikh.spanB, COLORS.ikhSpanB, "Senkou B");
    }

    // --- OSCILLATOR PANES ---
    let paneIdx = 1;

    const addOscillatorLine = (
      values: (number | null)[],
      color: string,
      title: string,
      pane: number,
      lineWidth: 1 | 2 = 1
    ) => {
      const s = chart.addSeries(
        LineSeries,
        { color, lineWidth, priceLineVisible: false, lastValueVisible: true, title },
        pane
      );
      const data = values
        .map((v, i) => (v !== null ? { time: times[i], value: v } : null))
        .filter((x): x is { time: Time; value: number } => x !== null);
      s.setData(data);
      return s;
    };

    const addOscillatorHistogram = (
      values: (number | null)[],
      title: string,
      pane: number,
      posColor = "rgba(34,197,94,0.6)",
      negColor = "rgba(239,68,68,0.6)"
    ) => {
      const s = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: true, title },
        pane
      );
      const data = values
        .map((v, i) =>
          v !== null
            ? { time: times[i], value: v, color: v >= 0 ? posColor : negColor }
            : null
        )
        .filter(
          (x): x is { time: Time; value: number; color: string } => x !== null
        );
      s.setData(data);
      return s;
    };

    if (indicators.has("RSI")) {
      addOscillatorLine(computeRSI(closes), COLORS.rsi, "RSI (14)", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("MACD")) {
      const m = computeMACD(closes);
      addOscillatorHistogram(m.histogram, "MACD Hist", paneIdx);
      addOscillatorLine(m.macd, COLORS.macd, "MACD", paneIdx);
      addOscillatorLine(m.signal, COLORS.macdSignal, "Signal", paneIdx);
      paneIdx++;
    }

    if (indicators.has("AOS")) {
      addOscillatorHistogram(
        computeAwesomeOscillator(highs, lows),
        "Awesome Osc.",
        paneIdx
      );
      paneIdx++;
    }

    if (indicators.has("ARO")) {
      addOscillatorLine(computeAroon(highs, lows), COLORS.aro, "Aroon Osc.", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("CCI")) {
      addOscillatorLine(computeCCI(highs, lows, closes), COLORS.cci, "CCI (20)", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("MOM")) {
      addOscillatorLine(computeMomentum(closes), COLORS.mom, "Momentum (10)", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("OBOS")) {
      addOscillatorLine(computeOBOS(closes), COLORS.obos, "OBOS %", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("DIX")) {
      const di = computeDI(highs, lows, closes);
      addOscillatorLine(di.plusDI, COLORS.diPlus, "DI+", paneIdx);
      addOscillatorLine(di.minusDI, COLORS.diMinus, "DI−", paneIdx);
      paneIdx++;
    }

    if (indicators.has("FSTOC")) {
      const st = computeFastStochastic(highs, lows, closes);
      addOscillatorLine(st.k, COLORS.fstocK, "%K", paneIdx);
      addOscillatorLine(st.d, COLORS.fstocD, "%D", paneIdx);
      paneIdx++;
    }

    if (indicators.has("RSL")) {
      addOscillatorLine(computeRSL(closes), COLORS.rsl, "RSL (130)", paneIdx, 2);
      paneIdx++;
    }

    if (indicators.has("MFI")) {
      const vols = candles.map((c) => c.volume);
      addOscillatorLine(
        computeMFI(highs, lows, closes, vols, 14),
        COLORS.mfi,
        "MFI (14)",
        paneIdx,
        2
      );
      paneIdx++;
    }

    if (indicators.has("OBV")) {
      const vols = candles.map((c) => c.volume);
      addOscillatorLine(computeOBV(closes, vols), COLORS.obv, "OBV", paneIdx, 2);
      paneIdx++;
    }

    // Configure pane heights — main pane larger, oscillators smaller
    try {
      const panes = chart.panes();
      if (panes[0]) panes[0].setHeight(mainHeight);
      for (let i = 1; i < panes.length; i++) {
        panes[i].setHeight(oscHeight);
      }
    } catch {
      // pane API may differ; silently skip
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    if (onChartReady) onChartReady(chart);

    const resizeObserver = new ResizeObserver(() => {
      if (ref.current) {
        chart.applyOptions({ width: ref.current.clientWidth });
      }
    });
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, height, indicators]);

  const oscCount = Array.from(indicators).filter((k) =>
    [
      "RSI",
      "MACD",
      "AOS",
      "ARO",
      "CCI",
      "MOM",
      "OBOS",
      "DIX",
      "FSTOC",
      "RSL",
      "MFI",
      "OBV",
    ].includes(k)
  ).length;
  const totalHeight = Math.max(height, height + oscCount * 80);

  return <div ref={ref} className="w-full" style={{ height: totalHeight }} />;
}
