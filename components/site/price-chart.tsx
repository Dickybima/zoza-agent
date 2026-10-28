"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart } from "lightweight-charts";
import type { CandlestickData, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

import { fmtPrice } from "@/lib/format";

export type Candle = CandlestickData<UTCTimestamp>;

// lightweight-charts parses its own colors, so the theme is mirrored in hex
const THEMES = {
  dark: { text: "#8d8d97", grid: "#1d1d22", border: "#26262c", up: "#2fe0b5", down: "#f05252" },
  light: { text: "#6b6b75", grid: "#ececf0", border: "#d9d9df", up: "#0f9f7f", down: "#d93636" },
};

function themeOptions() {
  const t = document.documentElement.classList.contains("dark") ? THEMES.dark : THEMES.light;
  return {
    chart: {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: t.text, fontFamily: "var(--font-mono), ui-monospace, monospace" },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border },
    },
    series: { upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down, borderVisible: false },
  };
}

/** Candlestick chart that follows the site's light/dark theme. */
export function PriceChart({ candles }: { candles: Candle[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const theme = themeOptions();
    const chart = createChart(box, {
      autoSize: true,
      ...theme.chart,
      timeScale: { ...theme.chart.timeScale, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: fmtPrice },
      crosshair: { mode: 1 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      ...theme.series,
      priceFormat: { type: "custom", formatter: fmtPrice, minMove: 1e-15 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // re-theme when the site toggles light/dark
    const mo = new MutationObserver(() => {
      const t = themeOptions();
      chart.applyOptions(t.chart);
      series.applyOptions(t.series);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData(candles);
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={boxRef} className="h-full w-full" />;
}
