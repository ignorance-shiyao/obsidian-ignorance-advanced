import type { EChartsType } from "echarts";
import { buildEChartsTheme, echartsThemeName } from "./echarts-core.js";
import type { EChartsThemeTokens } from "./echarts-core.js";
import { wheelZoomFactor } from "./zoom-step-core.js";
import { chartRendererFor, loadECharts, readThemeTokens } from "./echarts-renderer.js";

/* One ECharts chart inside a knowledge view or block: the plugin's bundled engine and theme,
   SVG while exporting (a static picture in PDF / HTML), resized with its box and redrawn when the theme changes. */

export interface KbChartHandle { chart: EChartsType | null; update(): void; dispose(): void }

/** `view`: drawn on canvas in a view (fast with many items); blocks follow the plugin's rule (SVG when exporting or paged). */
export function mountKbChart(host: HTMLElement, build: (tokens: EChartsThemeTokens, width: number) => { option: Record<string, unknown>; height: number }, bind?: (chart: EChartsType) => void, view = false): KbChartHandle {
  const renderer = () => view ? "canvas" : chartRendererFor(host);
  const handle: KbChartHandle = { chart: null, update: () => void draw(), dispose };
  let disposed = false, themeName = "", observer: ResizeObserver | null = null, lastWidth = 0;
  const onCss = () => { themeName = ""; void draw(); };

  async function draw() {
    const engine = await loadECharts();
    if (disposed) return;
    const tokens = readThemeTokens(host);
    const name = echartsThemeName(tokens);
    // The chart fills the content box: padding on the host must not push it past the edge.
    const box = getComputedStyle(host);
    const padX = parseFloat(box.paddingLeft) + parseFloat(box.paddingRight) || 0;
    const frameY = (parseFloat(box.paddingTop) + parseFloat(box.paddingBottom) + parseFloat(box.borderTopWidth) + parseFloat(box.borderBottomWidth)) || 0;
    const width = Math.max(240, (host.clientWidth || host.parentElement?.clientWidth || 720) - padX);
    const { option, height } = build(tokens, width);
    const frame = box.boxSizing === "border-box" ? frameY : 0;
    if (handle.chart && name !== themeName) { handle.chart.dispose(); handle.chart = null; }
    if (!handle.chart) {
      engine.registerTheme(name, buildEChartsTheme(tokens));
      themeName = name;
      host.style.height = `${height + frame}px`;
      handle.chart = engine.init(host, name, { renderer: renderer(), width, height });
      bind?.(handle.chart);
    } else {
      host.style.height = `${height + frame}px`;
      handle.chart.resize({ width, height });
    }
    lastWidth = width;
    handle.chart.setOption({ animation: renderer() === "canvas", ...option }, true);
  }

  /* ECharts zooms a graph by a fixed 10% per wheel event and a time axis by a large share of its range, so a mouse
     wheel jumps too far. The wheel is taken over here and zoomed with the shared step instead. */
  const onWheel = (event: WheelEvent) => {
    const chart = handle.chart;
    if (!chart || chart.isDisposed()) return;
    const option = chart.getOption() as { series?: { type?: string; roam?: unknown }[]; dataZoom?: { type?: string; startValue?: number; endValue?: number }[] };
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const factor = wheelZoomFactor(event.deltaY);
    const graph = option.series?.findIndex(item => item.type === "graph" && item.roam);
    if (graph !== undefined && graph >= 0) {
      event.preventDefault(); event.stopPropagation();
      chart.dispatchAction({ type: "graphRoam", seriesIndex: graph, zoom: factor, originX: x, originY: y });
      return;
    }
    const zoom = option.dataZoom?.find(item => item.type === "inside" && item.startValue !== undefined && item.endValue !== undefined);
    if (!zoom || zoom.startValue === undefined || zoom.endValue === undefined) return;
    const pivot = Number(chart.convertFromPixel({ xAxisIndex: 0 }, x));
    if (!Number.isFinite(pivot)) return;
    event.preventDefault(); event.stopPropagation();
    chart.dispatchAction({ type: "dataZoom", startValue: pivot - (pivot - zoom.startValue) / factor, endValue: pivot + (zoom.endValue - pivot) / factor });
  };
  host.addEventListener("wheel", onWheel, { capture: true, passive: false });

  function dispose() {
    host.removeEventListener("wheel", onWheel, { capture: true });
    disposed = true;
    observer?.disconnect();
    host.doc.removeEventListener("css-change-kb", onCss);
    handle.chart?.dispose();
    handle.chart = null;
  }

  observer = new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - lastWidth) > 4) void draw(); });
  observer.observe(host);
  host.doc.addEventListener("css-change-kb", onCss);
  void draw();
  return handle;
}

/** Tell every mounted chart that the theme changed (Obsidian's css-change workspace event). */
export function notifyKbCharts() {
  document.dispatchEvent(new Event("css-change-kb"));
}
