export interface EChartsThemeTokens {
  colors: string[];
  primary: string;
  text: string;
  muted: string;
  border: string;
  background: string;
  fontFamily: string;
  dark: boolean;
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([\da-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${color}${value}`;
}

function axisTheme(tokens: EChartsThemeTokens) {
  const split = withAlpha(tokens.border, 0.6);
  return {
    axisLine: { show: true, lineStyle: { color: tokens.border } },
    axisTick: { show: false, lineStyle: { color: tokens.border } },
    axisLabel: { show: true, color: tokens.muted },
    splitLine: { show: true, lineStyle: { color: split, type: "dashed" } },
    splitArea: { show: false, areaStyle: { color: [withAlpha(tokens.text, 0.025), withAlpha(tokens.text, 0.05)] } }
  };
}

export function buildEChartsTheme(tokens: EChartsThemeTokens) {
  const colors = tokens.colors.length ? tokens.colors : [tokens.primary];
  const axis = axisTheme(tokens);
  return {
    color: colors,
    backgroundColor: "transparent",
    textStyle: { color: tokens.text, fontFamily: tokens.fontFamily },
    title: { textStyle: { color: tokens.text, fontWeight: 700 }, subtextStyle: { color: tokens.muted }, left: "center" },
    legend: { textStyle: { color: tokens.text }, itemGap: 18, icon: "roundRect" },
    tooltip: {
      backgroundColor: tokens.dark ? "rgba(11, 16, 32, .96)" : "rgba(31, 41, 55, .94)",
      borderColor: "transparent", borderRadius: 10, padding: [8, 12], textStyle: { color: "#fff" },
      extraCssText: "box-shadow: 0 8px 24px rgba(0,0,0,.18);"
    },
    categoryAxis: axis, valueAxis: axis, logAxis: axis, timeAxis: axis,
    line: { itemStyle: { borderWidth: 2 }, lineStyle: { width: 3 }, symbolSize: 7, symbol: "emptyCircle", smooth: true },
    bar: { itemStyle: { barBorderColor: "transparent", barBorderWidth: 0, borderRadius: [6, 6, 0, 0] } },
    pie: { itemStyle: { borderColor: tokens.background, borderWidth: 3, borderRadius: 6 } },
    scatter: { itemStyle: { borderWidth: 1.5, borderColor: tokens.background } },
    radar: {
      splitArea: { show: true, areaStyle: { color: [withAlpha(tokens.text, 0.025), withAlpha(tokens.text, 0.045)] } },
      axisLine: { lineStyle: { color: withAlpha(tokens.border, 0.8) } },
      splitLine: { lineStyle: { color: withAlpha(tokens.border, 0.8) } }
    },
    gauge: { itemStyle: { color: colors[0] }, axisLine: { lineStyle: { width: 18 } }, progress: { width: 18 }, detail: { fontWeight: 700 } },
    funnel: { itemStyle: { borderColor: tokens.background, borderWidth: 2 } },
    graph: { color: colors, itemStyle: { borderRadius: 6 }, label: { color: tokens.text, textBorderWidth: 0, textBorderColor: "transparent" } },
    visualMap: { color: [colors[0], colors[Math.min(2, colors.length - 1)], colors[colors.length - 1]] },
    candlestick: {
      itemStyle: { color: colors[Math.min(4, colors.length - 1)], color0: colors[Math.min(2, colors.length - 1)], borderColor: colors[Math.min(4, colors.length - 1)], borderColor0: colors[Math.min(2, colors.length - 1)] }
    }
  };
}

export function echartsThemeName(tokens: EChartsThemeTokens): string {
  const value = JSON.stringify([tokens.colors, tokens.text, tokens.muted, tokens.border, tokens.background, tokens.fontFamily, tokens.dark]);
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  return `ignorance-${(hash >>> 0).toString(36)}`;
}

export function parseEChartsOption(source: string): Record<string, unknown> {
  let option: unknown;
  try { option = JSON.parse(source.trim()); }
  catch (error) { throw new Error(`图表配置必须是有效 JSON：${error.message}`); }
  if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("图表配置根节点必须是 JSON 对象");
  return option as Record<string, unknown>;
}

export function normalizeEChartsOption(option: Record<string, unknown>, renderer: "canvas" | "svg") {
  // Reserve separate rows for a conventional top title, subtitle and legend.
  // Custom side/bottom layouts and multiple components keep their coordinates.
  const title = option.title as any;
  const legend = option.legend as any;
  const topPixels = (value: unknown, fallback: number) => value == null ? fallback : typeof value === "number" ? value : NaN;
  if (title && !Array.isArray(title) && title.show !== false && title.bottom == null && title.text &&
      legend && !Array.isArray(legend) && legend.show !== false && legend.bottom == null && legend.orient !== "vertical") {
    const titleTop = topPixels(title.top, 0);
    const legendTop = topPixels(legend.top, 0);
    const textHeight = String(title.text).split("\n").length * Number(title.textStyle?.lineHeight || title.textStyle?.fontSize || 18);
    const subHeight = title.subtext ? Number(title.itemGap ?? 10) + String(title.subtext).split("\n").length * Number(title.subtextStyle?.lineHeight || title.subtextStyle?.fontSize || 12) : 0;
    const padding = title.padding ?? 5;
    const verticalPadding = typeof padding === "number" ? padding * 2 : Array.isArray(padding) ? Number(padding[0] || 0) + Number(padding[2] ?? padding[0] ?? 0) : 10;
    const safeTop = titleTop + textHeight + subHeight + verticalPadding + 8;
    if (Number.isFinite(legendTop) && Number.isFinite(safeTop) && legendTop < safeTop) {
      option = { ...option, legend: { ...legend, top: safeTop } };
    }
    const grid = option.grid as any;
    const actualLegendTop = Math.max(legendTop, safeTop);
    if (grid && !Array.isArray(grid) && Number.isFinite(actualLegendTop)) {
      const safeGridTop = actualLegendTop + Math.max(14, Number(legend.itemHeight || 14), Number(legend.textStyle?.fontSize || 12)) + 24;
      if (topPixels(grid.top, 60) < safeGridTop) option = { ...option, grid: { ...grid, top: safeGridTop } };
    }
  }
  // Native force defaults use 30px edges and hide node names, leaving a
  // small anonymous cluster in a full chart canvas. Authored values win.
  if (Array.isArray(option.series) && option.series.some((series: any) => series?.type === "graph" && series.layout === "force")) option = { ...option, series: option.series.map((series: any) => {
    if (!series || series.type !== "graph" || series.layout !== "force") return series;
    return { ...series,
      force: { repulsion: 406.25, edgeLength: 125, initLayout: "circular", ...series.force },
      label: { show: true, position: "right", ...series.label }
    };
  }) };
  if (renderer !== "svg" || !Array.isArray(option.series)) return option;
  return {
    ...option,
    series: option.series.map(item => {
      if (!item || typeof item !== "object") return item;
      const series = item as Record<string, unknown>;
      if (series.type !== "lines" || !series.effect || typeof series.effect !== "object") return series;
      return { ...series, effect: { ...(series.effect as Record<string, unknown>), show: false } };
    })
  };
}

export { withAlpha };
