import { observedSize, waitForSize } from "./element-size.js";
import { setIcon, UI_ICONS } from "./ui-icons.js";
import { HALF_A4_HEIGHT, DIAGRAM_HEADER_HEIGHT } from "./diagram-fit.js";
import { readAsset } from "./assets.js";
import { buildEChartsTheme, echartsThemeName, normalizeEChartsOption, parseEChartsOption } from "./echarts-core.js";
import { graphPixelBounds, fitDefaultGraph } from "./echarts-graph.js";

const { Component } = require("obsidian");
const ECHARTS_FILE = "echarts.min.js";
let echartsLoad: Promise<any> | null = null;
const registeredThemes = new Set<string>();
// Charts already shown once this session: Obsidian re-renders sections as they
// scroll back into view, and replaying the intro animation looked like flicker.
const shownCharts = new Set<string>();
const NEAR_VIEW = "1600px 0px";
const previewCache = new Map();
let drawTurn: Promise<unknown> = Promise.resolve();
let tooltipSerial = 0;

function loadECharts(plugin) {
  if (!echartsLoad) {
    echartsLoad = (async () => {
      const source = await readAsset(plugin, ECHARTS_FILE);
      let captured = null;
      const scope = new Proxy(globalThis, {
        set(target, key, value) {
          if (key === "echarts") { captured = value; return true; }
          return Reflect.set(target, key, value, target);
        }
      });
      new Function("exports", "module", "define", "globalThis", `${source}\n;return undefined;`)(undefined, undefined, undefined, scope);
      const engine = captured || scope.echarts;
      if (!engine || typeof engine.init !== "function" || !/^6\.1\./.test(engine.version || "")) {
        throw new Error("插件目录中的 ECharts 运行文件不可用或版本不匹配");
      }
      return engine;
    })().catch(error => {
      echartsLoad = null;
      throw error;
    });
  }
  return echartsLoad;
}

// Reading computed styles forces a style pass; charts share one reading until the theme changes.
let tokenCache = null;
function readThemeTokens(element = null) {
  const root = element?.closest(".skin-palette") || document.body;
  const dark = root.dataset.ibMode ? root.dataset.ibMode === "dark" : document.body.classList.contains("theme-dark");
  if (tokenCache && tokenCache.dark === dark && tokenCache.root === root) return tokenCache;
  tokenCache = { ...readThemeTokensNow(root), root };
  return tokenCache;
}
function forgetThemeTokens() { tokenCache = null; }

function readThemeTokensNow(root = document.body) {
  const style = getComputedStyle(root);
  const read = name => style.getPropertyValue(name).trim();
  const primary = read("--ib-accent-solid") || "#4D81EF";
  const colors = Array.from({ length: 8 }, (_, index) => read(`--ib-chart-${index + 1}`)).filter(Boolean);
  return {
    colors: colors.length ? colors : [primary, "#D97706", "#0F8A72", "#B6548C", "#2F8DBD", "#C9561B", "#7867C9", "#6F7A29"],
    primary,
    text: read("--ib-text-primary") || "#1F2937",
    muted: read("--ib-text-muted") || "#64748B",
    border: read("--ib-border-default") || "#E5EAF0",
    background: read("--ib-bg-primary") || "#FFFFFF",
    fontFamily: read("--font-text") || getComputedStyle(document.body).fontFamily,
    dark: root.dataset.ibMode ? root.dataset.ibMode === "dark" : document.body.classList.contains("theme-dark")
  };
}

function chartRendererFor(element) {
  return document.body.classList.contains("ibp-exporting")
    || document.body.classList.contains("ibp-paged")
    || !!element.closest(".ibp-staging, .ibp-export") ? "svg" : "canvas";
}

function setChartError(element, error) {
  element.dataset.ibEchartsState = "error";
  element.replaceChildren();
  const message = element.createEl("pre", { cls: "ib-echarts-error" });
  message.textContent = `ECharts 渲染失败：${error instanceof Error ? error.message : String(error)}`;
}

function renderEChartsBlock(plugin, source, element, context) {
  element.addClass("ib-echarts-block");
  element.dataset.ibEchartsState = "loading";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "ECharts 图表");

  let option;
  try { option = parseEChartsOption(source); }
  catch (error) { setChartError(element, error); return; }
  element.replaceChildren();
  plugin.rememberSource(element, context);
  if (!plugin.echartsSources) plugin.echartsSources = new WeakMap();
  plugin.echartsSources.set(element, source);
  const { header, toolbar } = plugin.buildBlockHeader(element, { label: "ECharts", withZoom: true });
  element.appendChild(header);
  const viewport = element.createDiv({ cls: "ib-echarts-viewport" });
  const cachedKey = `${echartsThemeName(readThemeTokens(element))}\n${source.trim()}`;
  const cachedPreview = previewCache.get(cachedKey);
  let placeholder = null;
  element.dataset.ibEchartsPreloaded = String(Boolean(cachedPreview));
  if (cachedPreview) {
    placeholder = viewport.createDiv({ cls: "ib-echarts-placeholder" });
    placeholder.innerHTML = cachedPreview;
  }
  const surface = viewport.createDiv({ cls: "ib-echarts-surface" });
  const chartHost = surface.createDiv({ cls: "ib-echarts-host" });
  let zoom = 1;
  let viewportSize = { width:0, height:0 };
  let cardWidth = 0;
  const series = Array.isArray(option.series) ? option.series : [];
  const leaves = node => !node || node.collapsed || !node.children?.length ? 1 : node.children.reduce((count, child) => count + leaves(child), 0);
  const treeHeight = series.filter(item => item && item.type === "tree" && !["TB", "BT"].includes(item.orient))
    .reduce((height, item) => Math.max(height, (item.data || []).reduce((count, node) => count + leaves(node), 0) * 24 + 100), 0);
  // Fixed-pixel parts (calendar cells, a visualMap strip) do not shrink with a narrow card, so give them a floor.
  const contentFloor = option.calendar ? 340 : option.visualMap ? 300 : 260;
  const longTree = treeHeight + DIAGRAM_HEADER_HEIGHT > HALF_A4_HEIGHT;
  element.classList.toggle("is-long-diagram", longTree);
  const heightKey = `e\n${echartsThemeName(readThemeTokens(element))}\n${source.trim()}`;
  const remembered = plugin.heightMemory?.get(heightKey);
  if (remembered) element.style.height = `${remembered}px`;
  const sizeCard = () => {
    const exportLayout = element.closest(".ibp-staging,.ibp-book,.ibp-export,.ibp-export-preview__book");
    const viewportBudget = exportLayout ? HALF_A4_HEIGHT : Math.max(220, window.innerHeight * .72);
    const width = cardWidth;
    const ideal = longTree ? treeHeight + DIAGRAM_HEADER_HEIGHT : Math.min(HALF_A4_HEIGHT, viewportBudget, Math.max(contentFloor, width * .58 + DIAGRAM_HEADER_HEIGHT));
    const height = `${Math.round(ideal)}px`;
    if (width) plugin.heightMemory?.set(heightKey, Math.round(ideal));
    if (width && element.style.height !== height) { element.style.height = height; return true; }
    return false;
  };
  // DOM construction must not alternate style writes and layout reads for
  // every fence in a MarkdownRenderer batch. The drawing turn sizes the card.
  const applyZoom = () => {
    const { width, height } = viewportSize;
    chartHost.style.width = `${width}px`;
    chartHost.style.height = `${height}px`;
    chartHost.style.transform = `scale(${zoom})`;
    surface.style.width = `${width * zoom}px`;
    surface.style.height = `${height * zoom}px`;
    percent.textContent = `${Math.round(zoom * 100)}%`;
  };
  const zoomButton = (label, text, action) => {
    const button = toolbar.createEl("button", { text, attr: { type: "button", "aria-label": label, title: label } });
    if (text.startsWith("lucide-")) setIcon(button, text);
    button.addEventListener("click", action);
    return button;
  };
  // Zooming only magnifies the picture; the chart's layout stays as it was. A canvas chart would turn blurry when
  // scaled up as a bitmap, so once the zoom settles it is drawn again at a matching pixel ratio.
  let rendererNow = "svg";
  let crispScale = 1;
  let crispTimer = 0;
  const scheduleCrisp = () => {
    window.clearTimeout(crispTimer);
    crispTimer = window.setTimeout(() => {
      const target = rendererNow === "canvas" ? Math.min(6, Math.max(1, zoom)) : 1;
      if (Math.abs(target - crispScale) < .05 || !chart) return;
      crispScale = target;
      void draw();
    }, 220);
  };
  const setZoom = (value, anchor = null) => {
    const next = Math.min(8, Math.max(.25, value));
    if (next === zoom) return;
    const ratio = next / zoom;
    // Keep the point under the pointer (or the middle of the view) where it is.
    const box = viewport.getBoundingClientRect();
    const ax = anchor ? anchor.x - box.left : box.width / 2, ay = anchor ? anchor.y - box.top : box.height / 2;
    const contentX = viewport.scrollLeft + ax, contentY = viewport.scrollTop + ay;
    zoom = next;
    applyZoom();
    viewport.scrollLeft = contentX * ratio - ax;
    viewport.scrollTop = contentY * ratio - ay;
    scheduleCrisp();
  };
  zoomButton("缩小", UI_ICONS.zoomOut, () => setZoom(zoom / 1.1));
  const percent = zoomButton("恢复完整显示", "100%", () => { setZoom(1); viewport.scrollTo(0, 0); });
  percent.className = "ibm-mermaid-percent";
  zoomButton("放大", UI_ICONS.zoomIn, () => setZoom(zoom * 1.1));
  // Trackpad pinch and Ctrl/⌘ + wheel zoom the chart view, as they do for diagrams.
  viewport.addEventListener("wheel", event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const step = Math.min(.06, Math.abs(event.deltaY) * .0016);
    setZoom(zoom * (event.deltaY < 0 ? 1 + step : 1 - step), { x: event.clientX, y: event.clientY });
  }, { passive: false });

  const component = new Component();
  component.load();
  context.addChild(component);
  let chart = null;
  let graphFitTimer = 0;
  // Read-only geometry for repeatable checks of the actually rendered nodes.
  element.__ibGraphMetrics = () => chart && !chart.isDisposed()
    ? series.map((item, index) => item?.type === "graph" ? graphPixelBounds(chart, index) : null).filter(Boolean) : [];
  const tooltipClass = `ib-echarts-tooltip-${++tooltipSerial}`;
  const disposeChart = () => {
    window.clearTimeout(graphFitTimer);
    try { chart?.dispose(); }
    finally { document.querySelectorAll(`.${tooltipClass}`).forEach(node => node.remove()); chart = null; }
  };
  let generation = 0;
  let lastStamp = "";
  let lastSize = "";
  let deferred = false;
  const draw = async () => {
    const run = ++generation;
    element.dataset.ibEchartsState = "loading";
    try {
      const engine = await loadECharts(plugin);
      const tokens = readThemeTokens(element);
      const themeName = echartsThemeName(tokens);
      if (!registeredThemes.has(themeName)) {
        engine.registerTheme(themeName, buildEChartsTheme(tokens));
        registeredThemes.add(themeName);
      }
      const renderer = chartRendererFor(element);
      const stamp = `${themeName}|${renderer}`;
      // Resolved loader/size promises otherwise initialize every chart in one
      // microtask chain, and timers queued together can still share a task.
      // Chain the turns so each chart draws in a task of its own.
      await (drawTurn = drawTurn.then(() => new Promise(resolve => window.setTimeout(resolve, 0))));
      if (run !== generation || !element.isConnected) return;
      let size = await waitForSize(viewport);
      if (run !== generation || !element.isConnected) return;
      if (!size) { deferred = true; return; }
      viewportSize = size;
      // Promise continuations run inside the observer delivery. Move style
      // writes out of that delivery to avoid an undelivered-notification loop.
      await (drawTurn = drawTurn.then(() => new Promise(resolve => window.setTimeout(resolve, 0))));
      if (run !== generation || !element.isConnected) return;
      // The permanent observer may have delivered newer geometry while the
      // drawing turn waited. Keep that update instead of restoring old size.
      // Allow the browser to deliver the new viewport after changing card
      // height, rather than synchronously flushing every inserted chart.
      if (sizeCard()) {
        size = await waitForSize(viewport);
        if (run !== generation || !element.isConnected) return;
        if (!size) { deferred = true; return; }
        viewportSize = size;
      }
      // A single observer delivery can resolve many charts simultaneously.
      // Keep their actual ECharts initialization in separate task turns.
      await (drawTurn = drawTurn.then(() => new Promise(resolve => window.setTimeout(resolve, 0))));
      if (run !== generation || !element.isConnected) return;
      const { width, height } = viewportSize;
      if (!width || !height) { deferred = true; return; }
      applyZoom();
      deferred = false;
      disposeChart();
      delete element.dataset.ibGraphFit;
      rendererNow = renderer;
      chart = engine.init(chartHost, themeName, { renderer, useDirtyRect: false, width, height,
        ...(renderer === "canvas" ? { devicePixelRatio: (window.devicePixelRatio || 1) * crispScale } : {}) });
      lastSize = `${width}x${height}`;
      const normalized = { ...normalizeEChartsOption(parseEChartsOption(source), renderer) };
      const key = `${source.length}:${source.slice(0, 200)}`;
      if (cachedPreview || shownCharts.has(key) || renderer === "svg") normalized.animation = false;
      shownCharts.add(key);
      const tooltip = normalized.tooltip;
      if (!Array.isArray(tooltip)) normalized.tooltip = { ...(tooltip || {}), appendTo: document.body, confine: false, className: `${tooltip?.className || ""} ${tooltipClass}`,
        extraCssText: `${tooltip?.extraCssText || ""};z-index:var(--layer-tooltip,10000);pointer-events:none;` };
      chart.setOption(normalized);
      if (series.some(item => item?.type === "graph")) {
        const renderedChart = chart;
        let previous = [], stable = 0;
        const fitWhenSettled = () => {
          if (chart !== renderedChart || run !== generation || chart.isDisposed()) return;
          const bounds = series.map((item, index) => item?.type === "graph" ? graphPixelBounds(chart, index) : null);
          const settled = bounds.every((value, index) => !value || previous[index] &&
            Math.abs(value.width - previous[index].width) < .1 && Math.abs(value.height - previous[index].height) < .1);
          stable = settled ? stable + 1 : 0; previous = bounds;
          if (stable >= 3) {
            series.forEach((item, index) => { if (item?.type === "graph") fitDefaultGraph(chart, item, index); });
            element.dataset.ibGraphFit = "ready";
          }
          else graphFitTimer = window.setTimeout(fitWhenSettled, 100);
        };
        graphFitTimer = window.setTimeout(fitWhenSettled, 100);
      }
      placeholder?.remove(); placeholder = null;
      element.dataset.ibEchartsState = "ready";
      element.dataset.ibEchartsRenderer = renderer;
      element.dataset.ibEchartsTheme = themeName;
      lastStamp = stamp;
    } catch (error) {
      if (run === generation) {
        try { disposeChart(); } catch (_) {}
        chart = null;
        console.error("Ignorance Advanced: ECharts 渲染失败 —", (option.series || []).map(item => item.type).join(","), error);
        setChartError(element, error);
      }
    }
  };

  // One resize per frame, and only when the box really changed.
  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === viewport) viewportSize = observedSize(entry);
      else if (entry.target === element) cardWidth = Math.round(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    }
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(async () => {
      // Multiple charts resize together; spread their geometry work across
      // task turns instead of forcing a whole-note layout in one frame.
      await (drawTurn = drawTurn.then(() => new Promise(resolve => window.setTimeout(resolve, 0))));
      resizeFrame = 0;
      if (!component._loaded || !element.isConnected) return;
      if (sizeCard()) return; // The viewport observer reports the final height.
      const { width, height } = viewportSize;
      const size = `${width}x${height}`;
      if (deferred && width && height) { deferred = false; void draw(); return; }
      if (!chart || !width || !height || size === lastSize) return;
      lastSize = size;
      applyZoom();
      try { chart.resize({ width, height }); } catch (_) { /* next layout notification can retry */ }
    });
  });
  resizeObserver.observe(element);
  resizeObserver.observe(viewport);
  const onThemeChange = () => {
    if (document.body.dataset.ibThemeCapture && !element.closest(".ibp-export,.ibp-staging")) return;
    forgetThemeTokens();
    if (!chart) return; // not drawn yet: it reads the new theme when it comes into view
    const next = `${echartsThemeName(readThemeTokens(element))}|${chartRendererFor(element)}`;
    if (next !== lastStamp) void draw();
  };
  component.registerEvent(plugin.app.workspace.on("css-change", onThemeChange));
  component.registerDomEvent(window, "ib-theme-change", onThemeChange);
  component.register(() => {
    generation += 1;
    window.cancelAnimationFrame(resizeFrame);
    nearObserver?.disconnect();
    if (window.cancelIdleCallback) window.cancelIdleCallback(idleId); else clearTimeout(idleId);
    resizeObserver.disconnect();
    try { disposeChart(); } catch (_) { /* chart may already be disposed by Obsidian */ }
    chart = null;
  });
  // Draw when the chart comes near the viewport. Exports and paged layout
  // render off screen and need every chart at once.
  let idleId = 0;
  let started = false;
  const start = () => { if (started || !element.isConnected || !cardWidth) return; started = true; nearObserver?.disconnect(); nearObserver = null; void draw(); };
  let nearObserver = null;
  const eager = chartRendererFor(element) === "svg" || typeof IntersectionObserver !== "function";
  if (eager) void draw();
  else {
    nearObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      start();
    }, { rootMargin: NEAR_VIEW });
    nearObserver.observe(element);
    // Even charts well beyond the viewport prepare once the first screen is idle.
    const warm = () => start();
    if (window.requestIdleCallback) idleId = window.requestIdleCallback(warm, { timeout: 5000 });
    else idleId = window.setTimeout(warm, 1500);
  }
}

export async function preloadEChartsPreview(plugin, source) {
  const tokens = readThemeTokens(), name = echartsThemeName(tokens), key = `${name}\n${source.trim()}`;
  if (previewCache.has(key)) return;
  const engine = await loadECharts(plugin);
  if (!registeredThemes.has(name)) { engine.registerTheme(name, buildEChartsTheme(tokens)); registeredThemes.add(name); }
  const host = document.createElement("div");
  let chart;
  try {
    chart = engine.init(host, name, { renderer: "svg", width: 720, height: 416 });
    chart.setOption({ ...normalizeEChartsOption(parseEChartsOption(source), "svg"), animation: false });
    const svg = chart.renderToSVGString();
    if (svg.length < 250000) previewCache.set(key, svg);
    while (previewCache.size > 32) previewCache.delete(previewCache.keys().next().value);
  } finally { chart?.dispose(); }
}

export { ECHARTS_FILE, loadECharts, readThemeTokens, chartRendererFor, waitForSize, renderEChartsBlock };
