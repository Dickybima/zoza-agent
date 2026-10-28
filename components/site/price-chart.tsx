"use client";

import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, LineSeries, LineStyle, LineType, createChart } from "lightweight-charts";
import type { IChartApi, ISeriesApi, LineData, UTCTimestamp } from "lightweight-charts";

export type PricePoint = LineData<UTCTimestamp>;

// lightweight-charts parses its own colors, so the theme is mirrored in hex
const THEMES = {
  dark: { text: "#7d7d87", grid: "#17171b", border: "#222227", line: "#2fe0b5", cross: "#3a3a42" },
  light: { text: "#7a7a84", grid: "#f0f0f3", border: "#e2e2e7", line: "#0f9f7f", cross: "#c4c4cc" },
};

function themeOptions() {
  const t = document.documentElement.classList.contains("dark") ? THEMES.dark : THEMES.light;
  return {
    chart: {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: t.text, fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: t.grid, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: t.cross, style: LineStyle.Dashed, labelBackgroundColor: t.cross },
        horzLine: { color: t.cross, style: LineStyle.Dashed, labelBackgroundColor: t.cross },
      },
    },
    series: { color: t.line, crosshairMarkerBackgroundColor: t.line, priceLineColor: t.line },
  };
}

/** Thin single-line price chart that follows the site's light/dark theme. */
export function PriceChart({ points, format }: { points: PricePoint[]; format: (v: number) => string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const theme = themeOptions();
    const fmt = (v: number) => formatRef.current(v);
    const chart = createChart(box, {
      autoSize: true,
      ...theme.chart,
      timeScale: { ...theme.chart.timeScale, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: fmt },
      handleScale: { axisPressedMouseMove: false },
    });
    const series = chart.addSeries(LineSeries, {
      ...theme.series,
      lineWidth: 2,
      lineType: LineType.Simple, // straight segments: smoothing would invent swings between trades
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderWidth: 0,
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      priceFormat: { type: "custom", formatter: fmt, minMove: 1e-15 },
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
    seriesRef.current?.setData(points);
    if (points.length) chartRef.current?.timeScale().fitContent();
  }, [points]);

  return <div ref={boxRef} className="h-full w-full" />;
}
