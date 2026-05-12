"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type Time,
} from "lightweight-charts";

interface Props {
  data: Array<{ time: number; equity: number }>;
  height?: number;
  initialCapital: number;
}

export function EquityChart({ data, height = 220, initialCapital }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#12141a" },
        textColor: "#8a8f9a",
      },
      grid: {
        vertLines: { color: "#1a1d26" },
        horzLines: { color: "#1a1d26" },
      },
      rightPriceScale: { borderColor: "#262a35" },
      timeScale: { borderColor: "#262a35", timeVisible: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#3b82f6",
      topColor: "rgba(59, 130, 246, 0.4)",
      bottomColor: "rgba(59, 130, 246, 0.02)",
      lineWidth: 2,
    });
    series.setData(data.map((d) => ({ time: d.time as Time, value: d.equity })));

    series.createPriceLine({
      price: initialCapital,
      color: "#6b7280",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "Start",
    });

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, height, initialCapital]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
