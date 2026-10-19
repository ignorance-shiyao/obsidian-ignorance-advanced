import type { RenderingContext } from "../rendering-context.js";
import { tr } from "../i18n.js";
import { Component, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { applyStagedChartAlignment } from "./chart-alignment.js";
import { parseMarkdownContainers, type MarkdownContainer } from "./container-source.js";
import { setMarkup } from "./dom-markup.js";

import { wantsLenient, withBlankLines } from "./missing-blank-lines-core.js";
/** A parsed container plus the colour tone given to chapter cards. */
type ContainerNode = MarkdownContainer & { chapterTone?: number };

const parsedSources = new Map<string, { source: string; containers: ContainerNode[] }>();
const processing = new WeakSet();

function chapterContainers(source: string): ContainerNode[] {
  const nodes = parseMarkdownContainers(source);
  let index = 0;
  const walk = (items: ContainerNode[]) => items.forEach(node => {
    if (node.kind === "chapter") node.chapterTone = index++ % 3;
    walk(node.children);
  });
  walk(nodes);
  return nodes;
}

function sourceContainers(sourcePath: string, source: string) {
  const cached = parsedSources.get(sourcePath);
  if (cached?.source === source) return cached.containers;
  const containers = chapterContainers(source);
  parsedSources.set(sourcePath, { source, containers });
  if (parsedSources.size > 32) for (const oldest of parsedSources.keys()) { parsedSources.delete(oldest); break; }
  return containers;
}

function containingNode(nodes: ContainerNode[], lineStart: number, lineEnd: number): ContainerNode | null {
  for (const node of nodes) {
    if (lineStart > node.startLine && lineStart <= node.endLine && lineEnd <= node.endLine) return node;
    const nested = containingNode(node.children, lineStart, lineEnd);
    if (nested) return nested;
  }
  return null;
}

function makeContainer(node: ContainerNode) {
  const element = createEl(node.kind === "details" ? "details" : "div");
  element.className = `ibc-container ibc-container--${node.kind}`;
  element.dataset.ibcKind = node.kind;
  if (node.kind === "chapter") {
    element.dataset.ibcTone = String(node.chapterTone ?? 0);
    const rail = createSpan();
    rail.className = "ibc-chapter__rail";
    rail.setAttribute("aria-hidden", "true");
    element.appendChild(rail);
  }

  if (node.kind === "details") {
    const summary = createEl("summary");
    summary.textContent = node.title || "详情";
    element.appendChild(summary);
  } else if (node.kind === "panel" && node.title) {
    const header = createDiv();
    header.className = "ibc-container__head";
    header.textContent = node.title;
    element.appendChild(header);
  }

  if (node.kind === "tab") element.dataset.ibcTitle = node.title || "标签";

  if (node.kind === "matrix" && node.title.includes("|")) {
    const split = node.title.indexOf("|");
    const xAxis = node.title.slice(0, split).trim();
    const yAxis = node.title.slice(split + 1).trim();
    if (xAxis) element.dataset.ibcXAxis = xAxis;
    if (yAxis) element.dataset.ibcYAxis = yAxis;
  }
  return element;
}

/* Matrix axis labels are real elements, not ::before/::after, so every export
   (and in-page capture, which cannot place pseudo-elements or vertical
   writing-mode) draws them where they belong. The y label is stacked one
   character per line for the same reason. */
function finishMatrix(container: HTMLElement) {
  const { ibcXAxis: xAxis, ibcYAxis: yAxis } = container.dataset;
  if (!xAxis && !yAxis) return;
  const body = createDiv();
  body.className = "ibc-matrix__body";
  body.append(...container.childNodes);
  if (yAxis) {
    const y = container.createDiv({ cls: "ibc-matrix__axis ibc-matrix__axis--y" });
    y.setAttribute("aria-label", yAxis);
    for (const char of ["↑", ...yAxis]) y.createSpan({ text: char });
  }
  container.appendChild(body);
  if (xAxis) container.createDiv({ cls: "ibc-matrix__axis ibc-matrix__axis--x", text: `${xAxis} →` });
}

/* Tabs are pure CSS (radio inputs and labels, panels picked with :checked), so they keep working in
   exported HTML and clones where no script runs. Staged renders for export and pagination skip the
   switcher and lay every panel out in order with its title. */
let tabGroups = 0;
function finishTabs(container: HTMLElement, interactive: boolean) {
  const panels = [...container.querySelectorAll<HTMLElement>(":scope > .ibc-container--tab")];
  if (!panels.length) return;
  if (!interactive || panels.length < 2) { container.classList.add("ibc-tabs--static"); return; }
  const group = `ibc-tabs-${++tabGroups}`;
  const before = panels[0];
  panels.slice(0, 12).forEach((panel, index) => {
    const input = createEl("input");
    input.type = "radio";
    input.name = group;
    input.id = `${group}-${index}`;
    input.className = "ibc-tabs__radio";
    if (index === 0) { input.checked = true; input.setAttribute("checked", ""); }
    const label = createEl("label");
    label.htmlFor = input.id;
    label.className = "ibc-tabs__label";
    label.textContent = panel.dataset.ibcTitle || `标签 ${index + 1}`;
    container.insertBefore(input, before);
    container.insertBefore(label, before);
  });
  container.classList.add("ibc-tabs--interactive");
}

/* ::: compare with two images: a draggable divider reveals the first image over the second. The range
   input does the work (mouse, touch and keyboard); without script (exports) both images sit side by side. */
function finishCompare(container: HTMLElement, interactive: boolean) {
  const images = [...container.querySelectorAll("img")].slice(0, 2);
  if (images.length < 2) return;
  const frames = images.map(img => {
    const frame = createDiv();
    frame.className = "ibc-compare__pane";
    frame.appendChild(img.closest(".internal-embed") || img);
    return frame;
  });
  container.querySelectorAll(":scope > p").forEach(p => { if (!(p.textContent ?? "").trim() && !p.querySelector("img")) p.remove(); });
  container.append(...frames);
  if (!interactive) { container.classList.add("ibc-compare--static"); return; }
  const input = createEl("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.value = "50";
  input.className = "ibc-compare__range";
  input.setAttribute("aria-label", tr("拖动对比两张图片"));
  const sync = () => container.style.setProperty("--ibc-split", `${input.value}%`);
  input.addEventListener("input", sync);
  sync();
  container.appendChild(input);
  container.classList.add("ibc-compare--interactive");
}

// Gallery: one figure per image, captioned by its title (or alt text);
// the <br>s between images in the same paragraph would otherwise take grid cells.
function finishContainer(container: HTMLElement, interactive = false) {
  if (container.dataset.ibcKind === "tabs") { finishTabs(container, interactive); return; }
  if (container.dataset.ibcKind === "compare") { finishCompare(container, interactive); return; }
  if (container.dataset.ibcKind === "matrix") { finishMatrix(container); return; }
  if (container.dataset.ibcKind !== "gallery") return;
  const images = [...container.querySelectorAll("img")];
  if (!images.length) return;
  const figures = images.map(img => {
    const figure = createEl("figure");
    figure.className = "ibc-gallery__item";
    const embed = img.closest(".internal-embed") || img;
    figure.appendChild(embed);
    const caption = img.getAttribute("title") || img.getAttribute("alt") || "";
    if (caption && !/^\d+(x\d+)?$/.test(caption)) {
      const text = createEl("figcaption");
      text.textContent = caption;
      figure.appendChild(text);
    }
    return figure;
  });
  container.querySelectorAll(":scope > p").forEach(p => { if (!(p.textContent ?? "").trim() && !p.querySelector("img")) p.remove(); });
  container.append(...figures);
}

async function renderFragment(plugin: RenderingContext, sourcePath: string, source: string, target: HTMLElement, component: Component) {
  if (!source.trim()) return;
  await MarkdownRenderer.render(plugin.app, source, target, sourcePath, component);
}

async function renderRange(plugin: RenderingContext, sourcePath: string, source: string, start: number, end: number, nodes: ContainerNode[], target: HTMLElement, component: Component, interactive = false) {
  let cursor = start;
  for (const node of nodes) {
    if (node.startOffset < start || node.closeEnd > end) continue;
    await renderFragment(plugin, sourcePath, source.slice(cursor, node.startOffset), target, component);
    const container = makeContainer(node);
    target.appendChild(container);
    await renderRange(plugin, sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component, interactive);
    finishContainer(container, interactive);
    cursor = node.closeEnd;
  }
  await renderFragment(plugin, sourcePath, source.slice(cursor, end), target, component);
}

async function renderMarkdownWithContainers(plugin: RenderingContext, sourcePath: string, source: string, target: HTMLElement, component: Component, interactive = false) {
  // A table typed right under a paragraph still counts as a table in pages, slides and exports.
  if (wantsLenient(plugin)) source = withBlankLines(source);
  const containers = chapterContainers(source);
  if (!containers.length) {
    await renderFragment(plugin, sourcePath, source, target, component);
    await applyStagedChartAlignment(plugin, target, sourcePath, source);
    return;
  }

  let cursor = 0;
  for (const node of containers) {
    await renderFragment(plugin, sourcePath, source.slice(cursor, node.startOffset), target, component);
    const container = makeContainer(node);
    target.appendChild(container);
    await renderRange(plugin, sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component, interactive);
    finishContainer(container, interactive);
    cursor = node.closeEnd;
  }
  await renderFragment(plugin, sourcePath, source.slice(cursor), target, component);
  await applyStagedChartAlignment(plugin, target, sourcePath, source);
}

async function renderContainer(plugin: RenderingContext, element: HTMLElement, context: MarkdownPostProcessorContext, source: string, node: ContainerNode) {
  const component = new MarkdownRenderChild(element);
  component.load();
  const container = makeContainer(node);
  const originalHtml = element.innerHTML;
  // Render inside Obsidian's section element instead of replacing it: the
  // reading view caches that element and re-attaches it when the section
  // scrolls back into view or the view re-renders. A replaced element came
  // back as raw ::: text.
  element.replaceChildren(container);
  element.addClass("ibc-container-host");
  try {
    context.addChild(component);
    await renderRange(plugin, context.sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component, true);
    finishContainer(container, true);
  } catch (error) {
    component.unload();
    element.removeClass("ibc-container-host");
    setMarkup(element, originalHtml);
    console.error("Ignorance Advanced: ::: 容器渲染失败 —", error);
  }
}

function renderContainerBlocks(plugin: RenderingContext, element: HTMLElement, context: MarkdownPostProcessorContext | undefined) {
  if (!element || element.closest?.(".ibc-container")) return;
  // The reading view reuses section elements and resets their content to the
  // raw markup before post-processing again, so "already handled" is judged by
  // what the element holds now; `processing` only covers a render in flight.
  if (processing.has(element) || element.querySelector(":scope > .ibc-container")) return;
  const info = context?.getSectionInfo?.(element);
  const sourcePath = context?.sourcePath;
  if (!info || !sourcePath || !info.text) return;
  const containers = sourceContainers(sourcePath, info.text);
  if (!containers.length) return;

  const start = containers.find(node => node.startLine === info.lineStart);
  if (start) {
    processing.add(element);
    return renderContainer(plugin, element, context, info.text, start).finally(() => processing.delete(element));
  }

  const parent = containingNode(containers, info.lineStart, info.lineEnd);
  if (parent) {
    element.addClass("ibc-container-source-covered");
    element.dataset.ibcContainerOwner = `${sourcePath}:${parent.startLine}`;
  }
}

export { renderContainerBlocks, renderMarkdownWithContainers };
