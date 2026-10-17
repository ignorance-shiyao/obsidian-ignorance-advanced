import { markContext } from "../modules/context-markers.js";
import { DIAGRAM_HEADER_HEIGHT,HALF_A4_HEIGHT,diagramFit } from "../modules/diagram-fit.js";
import { measureDiagramFont } from "../modules/diagram-readable-scale.js";
import { clearPaint,diagramLabel,measureDrawnSize,measureRenderedContent,paintDiagram,t } from "../modules/mermaid-core.js";
import { UI_ICONS,setIcon } from "../modules/ui-icons.js";
import type { DiagramState, IgnorancePlugin, RetightenJob } from "../plugin-types.js";

// A queued refit job, with the fit scale measured for it along the way.
interface RefitJob extends RetightenJob { fit?: number }

// Raw viewBox plus the label text identify a diagram across renders (ids and styles vary).
function diagramHeightKey(svg: SVGSVGElement, viewBox: string) {
  const text = [...svg.querySelectorAll("text, .nodeLabel")].map(node => node.textContent).join("").slice(0, 160);
  return `m\n${viewBox}\n${text}`;
}

/* Diagram enhancement: wrap each rendered Mermaid / ECharts block in a pan-and-zoom canvas, then fit, tighten and size it to the page. */

export function enhanceAll(plugin: IgnorancePlugin, root: HTMLElement) {
  const diagrams: HTMLElement[] = [];
  if (root.matches?.(".mermaid")) diagrams.push(root);
  root.querySelectorAll?.<HTMLElement>(".mermaid").forEach(element => diagrams.push(element));
  plugin.enhanceDiagrams(diagrams);
}

/* Measuring happens in flushRetighten, batched per frame: measuring here
   forced a full layout of the note for every rendered diagram. */
export function enhanceDiagrams(plugin: IgnorancePlugin, diagrams: HTMLElement[]) {
  for (const diagram of diagrams) {
    if (diagram.classList.contains("ibm-mermaid-enhanced") && !diagram.querySelector(":scope > svg")) continue;
    // A deck mounts every slide at once; enhancing each synchronously held the thread for seconds.
    if (diagram.closest(".ibp-staging, .ibp-presentation-stage")) plugin.diagramEnhancements.enqueue(diagram);
    else plugin.enhanceDiagram(diagram);
  }
}

/* A diagram container is only enhanceable once its <svg> exists; Obsidian
   inserts the two separately, so this is called from several angles. */
export function disposeDiagram(plugin: IgnorancePlugin, container: HTMLElement) {
  const state = plugin.diagramStates.get(container);
  if (!state) return;
  state.cleanup?.();
  plugin.diagramStates.delete(container);
  plugin.retightenQueue?.delete(container);
  container.classList.remove("ibm-mermaid-enhanced", "is-panning", "is-interactive");
  container.querySelector(":scope > .ibm-block-header")?.remove();
  state.svg.style.removeProperty("transform");
  state.svg.style.removeProperty("transform-origin");
}

export function enhanceDiagram(plugin: IgnorancePlugin, container: HTMLElement) {
  // Paged pages hold frozen copies laid out from the staging strip; enhancing
  // them again would refit them to the page and change their height.
  if (container.closest?.(".ibp-book")) return;
  // The native reader is covered by paged output. Staging still needs
  // enhancement; leaving paging rerenders the native reader from source.
  if (plugin.state.page.paged && container.closest?.(".ibp-has-book") && !container.closest?.(".ibp-staging, .ibp-export")) return;
  // Obsidian renders into a hidden <div class="mermaid"> hung straight off
  // <body>, then copies the SVG string out. Touching that scratch div mid-
  // render corrupts what it copies, so leave it alone.
  if (container.parentElement === document.body) return;
  if (container.classList.contains("ibm-mermaid-enhanced")) {
    // A re-render drops a fresh <svg> straight into the container, outside
    // our canvas. Tear the old scaffolding down and build it again.
    if (!container.querySelector(":scope > svg")) return;
    plugin.diagramStates.get(container)?.cleanup?.();
    container.classList.remove("ibm-mermaid-enhanced", "is-panning");
    delete container.dataset.ibmHint;
    container.querySelector(":scope > .ibm-block-header")?.remove();
    container.querySelector(":scope > .ibm-mermaid-canvas")?.remove();
  }

  const svg = container.querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) return;

  // The first retighten tightens the viewBox, before the next paint.
  paintDiagram(svg, plugin.isDarkTheme());
  for (const labels of svg.querySelectorAll("g.edgeLabels")) labels.parentElement?.appendChild(labels);

  container.classList.add("ibm-mermaid-enhanced");
  markContext(container);
  const { header, toolbar } = plugin.buildBlockHeader(container, {
    label: diagramLabel(svg),
    withZoom: true
  });
  container.appendChild(header);

  const makeButton = (label: string, title: string) => {
    const button = createEl("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setCssProps({ "--no-tooltip": "true" });
    toolbar.appendChild(button);
    return button;
  };

  const zoomOut = makeButton("", t("zoomOut"));
  setIcon(zoomOut, UI_ICONS.zoomOut);
  const percent = makeButton("100%", t("fitTitle"));
  percent.className = "ibm-mermaid-percent";
  const zoomIn = makeButton("", t("zoomIn"));
  setIcon(zoomIn, UI_ICONS.zoomIn);

  const canvas = createDiv();
  canvas.className = "ibm-mermaid-canvas";
  // Obsidian's mobile sidebar swipe skips anything inside
  // [data-ignore-swipe] — the same marker its Canvas view uses — so a
  // horizontal drag on the diagram pans it instead of opening a drawer.
  canvas.setAttribute("data-ignore-swipe", "true");
  canvas.appendChild(svg);
  container.appendChild(canvas);
  // Reserve the height this diagram settled at last time, so it does not grow after it scrolls in.
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const key = diagramHeightKey(svg, viewBox);
    container.dataset.ibHeightKey = key;
    const remembered = plugin.heightMemory?.get(key);
    if (remembered) container.style.setProperty("--ibm-mermaid-canvas-height", `${remembered}px`);
  }

  const state: DiagramState = {
    svg,
    canvas,
    container,
    toolbar,
    scale: 1,
    x: 0,
    y: 0,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    percent
  };
  plugin.diagramStates.set(container, state);

  const apply = () => {
    state.scale = Math.min(Math.max(8, state.readableMinimum || 0), Math.max(0.001, state.scale));
    // Once the reader zooms by hand the frame stays as it is: the picture is magnified inside it and the note
    // around it does not reflow. Fitting again (double-click, the percentage) lets the frame size itself.
    if (!state.lockFrame) plugin.sizeCanvas(container, state);
    svg.setCssStyles({ transformOrigin: "50% 0" });
    // Cancel the drawing's offset inside its own box so the ink itself is
    // centred horizontally and hangs from the top gutter.
    const drawn = plugin.drawnSizes?.get(svg);
    const shiftX = drawn ? -drawn.offsetX * state.scale : 0;
    const shiftY = drawn ? -drawn.offsetY * state.scale : 0;
    svg.style.transform = `translate(-50%, 0) translate(${state.x + shiftX}px, ${state.y + shiftY}px) scale(${state.scale})`;
    percent.textContent = `${Math.round(state.scale * 100)}%`;
  };

  const zoomAt = (nextScale: number, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    if (!state.readableScroll) state.lockFrame = true;
    if (state.readableScroll) {
      const oldScale = state.scale;
      const left = canvas.scrollLeft, top = canvas.scrollTop;
      const x = clientX - rect.left, y = clientY - rect.top;
      state.scale = Math.min(Math.max(8, state.readableMinimum || 0), Math.max(0.05, nextScale));
      apply();
      const ratio = state.scale / oldScale;
      canvas.scrollLeft = Math.max(0, (left + x - 8) * ratio - x + 8);
      canvas.scrollTop = Math.max(0, (top + y - 8) * ratio - y + 8);
      return;
    }
    const pointX = clientX - rect.left - rect.width / 2;
    // The drawing hangs from the top gutter, so that is the zoom origin's y.
    const pointY = clientY - rect.top - 8;
    const previousScale = state.scale;
    const boundedScale = Math.min(8, Math.max(0.05, nextScale));
    const ratio = boundedScale / previousScale;
    state.scale = boundedScale;
    const { width } = plugin.getDiagramSize(svg);
    const parentWidth = plugin.availableWidth(container);
    const fillsAvailableWidth = state.lockFrame || width * boundedScale + 24 >= parentWidth;
    if (fillsAvailableWidth) {
      state.x = pointX - (pointX - state.x) * ratio;
      state.y = pointY - (pointY - state.y) * ratio;
    } else {
      state.x = 0;
      state.y = 0;
    }
    apply();
  };

  /* Gestures without a mode switch:
     - mouse / pen: drag pans straight away (a few px of slop keeps clicks);
     - touch, one finger: `touch-action: pan-y` lets the browser keep
       vertical swipes for page scrolling; only a horizontal-leaning drag
       reaches us, and then it pans freely;
     - touch, two fingers: pinch zooms around the midpoint and pans;
     - trackpad: pinch (ctrl+wheel) zooms, a horizontal swipe pans sideways,
       a vertical swipe keeps scrolling the page. */
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let pinch: { x: number; y: number; d: number; scale: number } | null = null;
  let dragging = false;
  let lastDragEnd = 0;
  const DRAG_SLOP = 4;

  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  const endGesture = () => {
    dragging = false;
    pinch = null;
    container.classList.remove("is-panning");
  };

  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as Element).closest(".ibm-mermaid-toolbar, .ibm-block-header")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY });
    if (pointers.size === 2) {
      pinch = { ...midpoint(), scale: state.scale };
      dragging = true;
      container.classList.add("is-panning");
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;

    if (pinch && pointers.size >= 2) {
      const m = midpoint();
      if (state.readableScroll) {
        canvas.scrollLeft -= m.x - pinch.x;
        canvas.scrollTop -= m.y - pinch.y;
      } else {
        state.x += m.x - pinch.x;
        state.y += m.y - pinch.y;
      }
      pinch.x = m.x;
      pinch.y = m.y;
      zoomAt(pinch.scale * (m.d / pinch.d), m.x, m.y);
      return;
    }
    if (!dragging) {
      const ox = event.clientX - p.sx;
      const oy = event.clientY - p.sy;
      if (Math.hypot(ox, oy) < DRAG_SLOP) return;
      // One finger, vertical-leaning: the page scrolls, the diagram stays
      // put. Drop the pointer so the rest of this swipe is ignored.
      if (event.pointerType === "touch" && Math.abs(oy) >= Math.abs(ox)) {
        pointers.delete(event.pointerId);
        return;
      }
      dragging = true;
      container.classList.add("is-panning");
      try { container.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone: the pan simply gets no capture */ }
    }
    event.preventDefault();
    if (state.readableScroll) {
      canvas.scrollLeft -= dx;
      canvas.scrollTop -= dy;
      return;
    }
    state.x += dx;
    state.y += dy;
    apply();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) endGesture();
    else for (const q of pointers.values()) { q.sx = q.x; q.sy = q.y; }
  };
  // A drag that ended on the diagram should not also count as a click.
  const onClickCapture = (event: MouseEvent) => {
    if (performance.now() - lastDragEnd < 250) {
      event.stopPropagation();
      event.preventDefault();
    }
  };
  const markDrag = () => {
    if (!dragging) return;
    lastDragEnd = performance.now();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      // A trackpad fires many notches per swipe, so keep each one small and
      // scale it with the reported delta rather than using a fixed step.
      const step = Math.min(0.06, Math.abs(event.deltaY) * 0.0016);
      const factor = event.deltaY < 0 ? 1 + step : 1 - step;
      zoomAt(state.scale * factor, event.clientX, event.clientY);
      return;
    }
    // Sideways swipe pans; vertical stays with the page.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.2) {
      if (state.readableScroll) return; // Native horizontal scrolling.
      event.preventDefault();
      state.x -= event.deltaX;
      apply();
    }
  };
  // Double-click refits instead of toggling a mode.
  const onDoubleClick = (event: MouseEvent) => {
    if ((event.target as Element).closest(".ibm-mermaid-toolbar, .ibm-block-header")) return;
    event.preventDefault();
    plugin.fitDiagram(container, state);
  };
  const onPointerUpCapture = () => markDrag();
  // Once the diagram owns a touch gesture (horizontal pan or pinch), keep
  // the page from scrolling underneath it.
  const onTouchMove = (event: TouchEvent) => {
    if (dragging || pointers.size >= 2) event.preventDefault();
  };
  container.addEventListener("touchmove", onTouchMove, { passive: false });

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUpCapture, true);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("click", onClickCapture, true);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("dblclick", onDoubleClick);
  const zoomFromCenter = (factor: number) => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(state.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  zoomOut.addEventListener("click", () => zoomFromCenter(1 / 1.1));
  zoomIn.addEventListener("click", () => zoomFromCenter(1.1));
  // Clicking the readout refits the diagram — that is what the separate Fit
  // button used to do.
  percent.addEventListener("click", () => plugin.fitDiagram(container, state));

  // Watch the text column, not the block: the block itself widens when it
  // bleeds into the margins, and that must not count as a resize.
  const column = () => plugin.bleedTarget(container).parentElement;
  // Recorded on the observer's first call, when layout is already clean;
  // reading it here forced a layout of the note per diagram.
  let lastParentWidth: number | null = null;
  const resizeObserver = new ResizeObserver(() => {
    const nextParentWidth = column()?.clientWidth || 0;
    if (lastParentWidth === null) { lastParentWidth = nextParentWidth; return; }
    if (Math.abs(nextParentWidth - lastParentWidth) < 2) return;
    lastParentWidth = nextParentWidth;
    if (!container.classList.contains("is-panning")) plugin.scheduleRetighten(container, state, svg);
  });
  if (column()) resizeObserver.observe(column());
  const pane = container.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
  if (pane) resizeObserver.observe(pane);

  state.apply = apply;
  const onGeometryChange = () => { if (!state.disposed) plugin.scheduleRetighten(container, state, svg); };
  state.cleanup = () => {
    if (state.disposed) return;
    state.disposed = true;
    svg.removeEventListener("ibm-geometry-change", onGeometryChange);
    resizeObserver.disconnect();
    state.visibility?.disconnect();
    clearPaint(svg);
    if (canvas.parentElement === container) container.insertBefore(svg, canvas);
    canvas.remove();
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerup", onPointerUpCapture, true);
    container.removeEventListener("pointerup", onPointerUp);
    container.removeEventListener("pointercancel", onPointerUp);
    container.removeEventListener("click", onClickCapture, true);
    container.removeEventListener("wheel", onWheel);
    container.removeEventListener("touchmove", onTouchMove);
    container.removeEventListener("dblclick", onDoubleClick);
    if (svg.dataset.ibmOriginalViewBox) {
      svg.setAttribute("viewBox", svg.dataset.ibmOriginalViewBox);
      delete svg.dataset.ibmOriginalViewBox;
    }
    svg.style.removeProperty("width");
    svg.style.removeProperty("height");
    svg.classList.remove("ibm-unclamp");
    plugin.setBleed(container, 0);
    container.classList.remove("is-readable-scroll");
    for (const name of ["--ibm-readable-width", "--ibm-readable-height", "--ibm-readable-center"]) container.style.removeProperty(name);
  };

  // Batched with every other diagram refitting this frame (see flushRetighten).
  const retighten = () => { if (!state.disposed && container.isConnected) plugin.scheduleRetighten(container, state, svg); };
  window.requestAnimationFrame(retighten);
  // Font loading is the actual late geometry change. Fixed retries refitted
  // every SVG twice even when no geometry had changed.
  if (document.fonts?.status === "loading") void document.fonts.ready.then(() => { if (container.isConnected) retighten(); });
  // Geometry fixes that run once the diagram is measurable (see
  // whenMeasurable) change the viewBox after this fit; refit when they do.
  svg.addEventListener("ibm-geometry-change", onGeometryChange);

  // Obsidian renders Mermaid inside a hidden, absolutely positioned div and
  // moves the result in afterwards, so the first measurement can land while
  // the SVG has no box at all. Re-measure the moment it becomes visible.
  const visibility = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visibility.disconnect();
    retighten();
  });
  visibility.observe(container);
  state.visibility = visibility;
}

/* The tallest the canvas may get before a diagram is shrunk to fit it. */
export function maxCanvasHeight(plugin: IgnorancePlugin) {
  return Math.max(140, Math.min(HALF_A4_HEIGHT - DIAGRAM_HEADER_HEIGHT, window.innerHeight * .72 - DIAGRAM_HEADER_HEIGHT));
}

/* Refit a bounded group in phases — all writes, then all reads — instead
   of fitting every diagram synchronously in one frame. */
export function scheduleRetighten(plugin: IgnorancePlugin, container: HTMLElement, state: DiagramState, svg: SVGSVGElement) {
  if (!plugin.retightenQueue) plugin.retightenQueue = new Map();
  plugin.retightenQueue.set(container, { state, svg });
  if (plugin.retightenFrame) return;
  plugin.retightenFrame = window.requestAnimationFrame(() => {
    plugin.retightenFrame = 0;
    plugin.flushRetighten();
  });
}

export function flushRetighten(plugin: IgnorancePlugin) {
  const eligible = [...plugin.retightenQueue].filter(([container, job]) => container.isConnected && !job.state.disposed && job.svg.isConnected && !(plugin.state.page.paged && container.closest(".ibp-has-book") && !container.closest(".ibp-staging, .ibp-export"))).map(([container, job]) => ({ container, ...job }));
  plugin.retightenQueue.clear();
  // Bound fitting work per frame; a long note can otherwise force every
  // SVG layout in one task. Consumers wait for their own stage to finish.
  const jobs = eligible.slice(0, 1);
  for (const job of eligible.slice(1)) plugin.retightenQueue.set(job.container, job);
  if (plugin.retightenQueue.size) {
    plugin.retightenFrame = window.requestAnimationFrame(() => {
      plugin.retightenFrame = 0;
      plugin.flushRetighten();
    });
  }
  if (!jobs.length) return;
  // Measure against the plain text column. With the block still bled into
  // the margins, an SVG sized in % grew with it, measured larger, fitted
  // smaller, and the diagram ended up small inside wide empty bands.
  for (const job of jobs) plugin.setBleed(job.container, 0);
  // Column widths hold still while refitting; reading them per diagram
  // between writes laid out the whole note twice per diagram.
  plugin.baseWidths = new Map(jobs.map(job => [job.container, plugin.availableWidth(job.container)]));
  try { plugin.refitJobs(jobs); }
  finally { plugin.baseWidths = null; }
}

export async function settleDiagramFits(plugin: IgnorancePlugin, root: HTMLElement, signal?: AbortSignal) {
  while (root.isConnected) {
    signal?.throwIfAborted();
    const pending = [...root.querySelectorAll<HTMLElement>(".mermaid")].some(container => {
      if (plugin.diagramEnhancements?.has(container)) return true;
      const state = plugin.diagramStates.get(container);
      return state && !state.disposed && (!state.fitted || plugin.retightenQueue?.has(container));
    });
    if (!pending) return;
    await new Promise<void>(resolve => { window.requestAnimationFrame(() => resolve()); });
  }
}

export function refitJobs(plugin: IgnorancePlugin, jobs: RefitJob[]) {
  // Background geometry updates must not undo a reader's internal scroll.
  // Explicit fitDiagram calls still reset the viewport through applyFit.
  const scrollPositions = new Map(jobs.filter(job => job.state.fitted).map(job => [job.state, {
    left: job.state.canvas.scrollLeft, top: job.state.canvas.scrollTop
  }]));
  for (const job of jobs) {
    try { plugin.measuredBounds.set(job.svg, measureRenderedContent(job.svg)); } catch { /* not measurable yet: tightenViewBox measures again */ }
  }
  for (const { svg, state } of jobs) {
    plugin.tightenViewBox(svg);
    // Pin the SVG box to its viewBox in px so it never follows the canvas.
    const box = svg.viewBox?.baseVal;
    if (box?.width && box?.height) {
      svg.style.setProperty("width", `${Math.ceil(box.width)}px`, "important");
      svg.style.setProperty("height", `${Math.ceil(box.height)}px`, "important");
      svg.classList.add("ibm-unclamp");
    }
    // Measure the real drawing at 100%, then fit from that.
    state.lockFrame = false;
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    plugin.drawnSizes?.delete(svg);
    state.apply?.();
  }
  if (!plugin.drawnSizes) plugin.drawnSizes = new WeakMap();
  for (const job of jobs) {
    const drawn = measureDrawnSize(job.svg);
    if (drawn) plugin.drawnSizes.set(job.svg, drawn);
    job.state.minimumFontPx = measureDiagramFont(job.svg, job.state.scale);
    job.fit = plugin.measureFit(job.container, job.state);
  }
  for (const job of jobs) {
    plugin.applyFit(job.state, job.fit);
    const position = scrollPositions.get(job.state);
    if (position && job.state.readableScroll) {
      job.state.canvas.scrollLeft = position.left;
      job.state.canvas.scrollTop = position.top;
    }
  }
}

export function fitDiagram(plugin: IgnorancePlugin, container: HTMLElement, state: DiagramState) {
  plugin.applyFit(state, plugin.measureFit(container, state));
}

export function applyFit(plugin: IgnorancePlugin, state: DiagramState, scale: number) {
  state.lockFrame = false;
  state.scale = scale;
  state.x = 0;
  state.y = 0;
  state.apply?.();
  state.canvas.scrollLeft = 0;
  state.canvas.scrollTop = 0;
  state.fitted = true;
  const key = state.container?.dataset.ibHeightKey;
  if (key) plugin.heightMemory?.set(key, parseFloat(state.container.style.getPropertyValue("--ibm-mermaid-canvas-height")));
}

export function measureFit(plugin: IgnorancePlugin, container: HTMLElement, state: DiagramState) {
  const { width, height } = plugin.getDiagramSize(state.svg);
  // Width: the text column plus whatever spare page width sits beside it.
  const bleed = Number(plugin.bleedTarget(container).dataset.ibmBleed || 0);
  const column = plugin.baseWidths?.get(container) ?? plugin.availableWidth(container) - bleed * 2;
  const room = column + plugin.maxBleed(container) * 2;
  const usableWidth = Math.max(100, room - 24);
  const fit = diagramFit(width, height, usableWidth, window.innerHeight);
  state.fitHeightLimit = fit.canvasLimit;
  container.classList.toggle("is-long-diagram", fit.long);
  const readable = fit.scale;
  state.readableMinimum = 0;
  state.readableScroll = false;
  return readable;
}

/* The space the drawing can use: the canvas itself. The block's parent can
   be wider than the canvas (Live Preview's embed wrapper is), and fitting to
   it let a flowchart overflow both sides by 22px. */
export function availableWidth(plugin: IgnorancePlugin, container: HTMLElement) {
  // Compact cards must still fit against the text column, not their own
  // previous width; otherwise repeated fits progressively shrink them.
  const column = plugin.bleedTarget(container).parentElement;
  if (column?.clientWidth) {
    const style = getComputedStyle(column);
    const text = column.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    // An authored width (dragged on the block) is the room the drawing has.
    const authored = Number(container.dataset.ibChartWidth) || 0;
    return authored ? Math.min(authored, text) : text;
  }
  const canvas = container.querySelector(":scope > .ibm-mermaid-canvas");
  return canvas?.clientWidth || container.clientWidth || 800;
}

/* The size the drawing actually occupies on screen at 100%, once measured.
   Deriving it from the viewBox is what left bands of empty canvas: inside
   Obsidian the viewBox-to-pixels ratio is not the one we set, so the canvas
   came out 1.5-2x taller (and wider) than the drawing. */
export function getDiagramSize(plugin: IgnorancePlugin, svg: SVGSVGElement) {
  const measured = plugin.drawnSizes?.get(svg);
  if (measured) return measured;
  const viewBox = svg.viewBox?.baseVal;
  let width = viewBox?.width || Number(svg.getAttribute("width")) || 800;
  let height = viewBox?.height || Number(svg.getAttribute("height")) || 450;
  if (!width || !height) {
    const bounds = svg.getBBox();
    width = bounds.width || 800;
    height = bounds.height || 450;
  }
  return { width, height };
}

export function tightenViewBox(plugin: IgnorancePlugin, svg: SVGSVGElement) {
  try {
    const measured = plugin.measuredBounds.get(svg);
    plugin.measuredBounds.delete(svg);
    const bounds = measured !== undefined ? measured : measureRenderedContent(svg);
    if (!bounds) return;
    const original = svg.getAttribute("viewBox");
    if (original) svg.dataset.ibmOriginalViewBox = original;
    // Proportional padding: a fixed 12px is generous on a 40px-tall block
    // diagram and stingy on a full-page flowchart.
    const padding = Math.max(3, Math.min(6, Math.min(bounds.width, bounds.height) * 0.04));
    const fittedWidth = bounds.width + padding * 2;
    const fittedHeight = bounds.height + padding * 2;
    svg.setAttribute("viewBox", [
      bounds.x - padding,
      bounds.y - padding,
      fittedWidth,
      fittedHeight
    ].join(" "));
    // Keep the CSS box and viewBox in the same coordinate system. Without
    // this, Mermaid's original width/height can leave a large empty canvas.
    svg.style.setProperty("width", `${Math.ceil(fittedWidth)}px`, "important");
    svg.style.setProperty("height", `${Math.ceil(fittedHeight)}px`, "important");
    // Obsidian's and the theme's `.mermaid svg { max-width: 100% !important;
    // max-height: calc(100vh - …) !important }` clamp the box to the canvas;
    // the drawing then shrinks inside it on top of our own zoom. Only an
    // inline !important outranks those.
    svg.classList.add("ibm-unclamp");
  } catch {
    // Some transient Mermaid SVGs are not measurable until the next render.
  }
}

/* The element that sits in the text column: Live Preview wraps the block
   in .cm-embed-block, which carries the visible frame there. */
export function bleedTarget(plugin: IgnorancePlugin, container: HTMLElement) {
  return container.closest<HTMLElement>(".cm-embed-block") || container;
}

/* How far the block may grow past the readable line width on each side:
   the smaller of the two gaps between the column and the pane's padding,
   so the block stays centred on the text. */
export function maxBleed(plugin: IgnorancePlugin, container: HTMLElement) {
  // With the page toolbar the text width is the user's choice: diagrams stay
  // inside it (zoom past it pans inside the card) instead of bleeding out.
  if (document.body.style.getPropertyValue("--ib-content-max")) return 0;
  if (container.dataset.ibChartWidth) return 0;
  const target = plugin.bleedTarget(container);
  const column = target.parentElement;
  const pane = container.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
  if (!column || !pane) return 0;
  const paneRect = pane.getBoundingClientRect();
  const colRect = column.getBoundingClientRect();
  const inset = 16;
  const left = colRect.left - paneRect.left - inset;
  const right = paneRect.right - colRect.right - inset - (pane.offsetWidth - pane.clientWidth);
  return Math.max(0, Math.floor(Math.min(left, right)));
}

export function setBleed(plugin: IgnorancePlugin, container: HTMLElement, perSide: number) {
  const target = plugin.bleedTarget(container);
  const value = Math.max(0, Math.round(perSide));
  if (Number(target.dataset.ibmBleed || 0) === value) return;
  if (value) {
    target.dataset.ibmBleed = String(value);
    target.style.setProperty("width", `calc(100% + ${value * 2}px)`, "important");
    target.classList.add("ibm-unclamp-width");
    target.style.setProperty("margin-left", `-${value}px`, "important");
    target.style.setProperty("margin-right", `-${value}px`, "important");
  } else {
    delete target.dataset.ibmBleed;
    target.classList.remove("ibm-unclamp-width");
    for (const prop of ["width", "margin-left", "margin-right"]) target.style.removeProperty(prop);
  }
}

export function sizeCanvas(plugin: IgnorancePlugin, container: HTMLElement, state: DiagramState) {
  const { width, height } = plugin.getDiagramSize(state.svg);
  const gutter = 8;
  const contentWidth = width * state.scale;
  const contentHeight = height * state.scale;
  container.style.setProperty("--ibm-diagram-card-width", `${Math.ceil(Math.max(320, contentWidth + gutter * 2))}px`);
  plugin.bleedTarget(container).style.setProperty("--ibm-diagram-card-width", `${Math.ceil(Math.max(320, contentWidth + gutter * 2))}px`);

  // Base width = the canvas as it would be without any bleed.
  const currentBleed = Number(plugin.bleedTarget(container).dataset.ibmBleed || 0);
  const baseWidth = plugin.baseWidths?.get(container) ?? plugin.availableWidth(container) - currentBleed * 2;
  // Zoomed past the text column: if the pane has spare width beside it
  // (readable line width on a wide window), let the block grow into it so
  // more of the diagram shows instead of being cropped.
  const overflow = contentWidth + gutter * 2 - baseWidth;
  const bleed = overflow > 0 ? Math.min(plugin.maxBleed(container), overflow / 2) : 0;
  plugin.setBleed(container, bleed);
  const parentWidth = baseWidth + Math.round(bleed) * 2;

  const fillsAvailableWidth = contentWidth + gutter * 2 >= parentWidth;
  // A diagram that already fills the width gets a capped viewport to pan in;
  // anything smaller is exactly as tall as it draws.
  // Exactly as tall as the drawing, capped; zooming past the cap pans.
  const readable = state.readableScroll;
  const canvasHeight = Math.min(state.fitHeightLimit || plugin.maxCanvasHeight(), contentHeight + gutter * 2) + (readable ? 16 : 0);
  container.classList.toggle("is-readable-scroll", !!readable);
  if (readable) {
    state.x = 0;
    state.y = 0;
    const scrollWidth = Math.max(parentWidth, contentWidth + gutter * 2);
    container.style.setProperty("--ibm-readable-width", `${Math.ceil(scrollWidth)}px`);
    container.style.setProperty("--ibm-readable-height", `${Math.ceil(contentHeight + gutter * 2)}px`);
    container.style.setProperty("--ibm-readable-center", `${scrollWidth / 2}px`);
  }
  container.classList.toggle("is-contained", fillsAvailableWidth);
  container.style.setProperty("--ibm-mermaid-canvas-height", `${Math.round(canvasHeight)}px`);
}
