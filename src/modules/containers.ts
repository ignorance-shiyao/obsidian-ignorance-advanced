import { applyStagedChartAlignment } from "./chart-alignment.js";
import { CONTAINER_KINDS, parseMarkdownContainers } from "./container-source.js";

const { Component, MarkdownRenderer } = require("obsidian");
const parsedSources = new Map();
const processing = new WeakSet();

function chapterContainers(source) {
  const nodes = parseMarkdownContainers(source);
  let index = 0;
  const walk = items => items.forEach(node => {
    if (node.kind === "chapter") node.chapterTone = index++ % 3;
    walk(node.children);
  });
  walk(nodes);
  return nodes;
}

function sourceContainers(sourcePath, source) {
  const cached = parsedSources.get(sourcePath);
  if (cached?.source === source) return cached.containers;
  const containers = chapterContainers(source);
  parsedSources.set(sourcePath, { source, containers });
  if (parsedSources.size > 32) parsedSources.delete(parsedSources.keys().next().value);
  return containers;
}

function containingNode(nodes, lineStart, lineEnd) {
  for (const node of nodes) {
    if (lineStart > node.startLine && lineStart <= node.endLine && lineEnd <= node.endLine) return node;
    const nested = containingNode(node.children, lineStart, lineEnd);
    if (nested) return nested;
  }
  return null;
}

function makeContainer(node) {
  const element = document.createElement(node.kind === "details" ? "details" : "div");
  element.className = `ibc-container ibc-container--${node.kind}`;
  element.dataset.ibcKind = node.kind;
  if (node.kind === "chapter") {
    element.dataset.ibcTone = String(node.chapterTone ?? 0);
    const rail = document.createElement("span");
    rail.className = "ibc-chapter__rail";
    rail.setAttribute("aria-hidden", "true");
    element.appendChild(rail);
  }

  if (node.kind === "details") {
    const summary = document.createElement("summary");
    summary.textContent = node.title || "详情";
    element.appendChild(summary);
  } else if (node.kind === "panel" && node.title) {
    const header = document.createElement("div");
    header.className = "ibc-container__head";
    header.textContent = node.title;
    element.appendChild(header);
  }

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
function finishMatrix(container) {
  const { ibcXAxis: xAxis, ibcYAxis: yAxis } = container.dataset;
  if (!xAxis && !yAxis) return;
  const body = document.createElement("div");
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

// Gallery: one figure per image, captioned by its title (or alt text);
// the <br>s between images in the same paragraph would otherwise take grid cells.
function finishContainer(container) {
  if (container.dataset.ibcKind === "matrix") { finishMatrix(container); return; }
  if (container.dataset.ibcKind !== "gallery") return;
  const images = [...container.querySelectorAll("img")];
  if (!images.length) return;
  const figures = images.map(img => {
    const figure = document.createElement("figure");
    figure.className = "ibc-gallery__item";
    const embed = img.closest(".internal-embed") || img;
    figure.appendChild(embed);
    const caption = img.getAttribute("title") || img.getAttribute("alt") || "";
    if (caption && !/^\d+(x\d+)?$/.test(caption)) {
      const text = document.createElement("figcaption");
      text.textContent = caption;
      figure.appendChild(text);
    }
    return figure;
  });
  container.querySelectorAll(":scope > p").forEach(p => { if (!p.textContent.trim() && !p.querySelector("img")) p.remove(); });
  container.append(...figures);
}

async function renderFragment(plugin, sourcePath, source, target, component) {
  if (!source.trim()) return;
  await MarkdownRenderer.render(plugin.app, source, target, sourcePath, component);
}

async function renderRange(plugin, sourcePath, source, start, end, nodes, target, component) {
  let cursor = start;
  for (const node of nodes) {
    if (node.startOffset < start || node.closeEnd > end) continue;
    await renderFragment(plugin, sourcePath, source.slice(cursor, node.startOffset), target, component);
    const container = makeContainer(node);
    target.appendChild(container);
    await renderRange(plugin, sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component);
    finishContainer(container);
    cursor = node.closeEnd;
  }
  await renderFragment(plugin, sourcePath, source.slice(cursor, end), target, component);
}

async function renderMarkdownWithContainers(plugin, sourcePath, source, target, component) {
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
    await renderRange(plugin, sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component);
    finishContainer(container);
    cursor = node.closeEnd;
  }
  await renderFragment(plugin, sourcePath, source.slice(cursor), target, component);
  await applyStagedChartAlignment(plugin, target, sourcePath, source);
}

async function renderContainer(plugin, element, context, source, node) {
  const component = new Component();
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
    await renderRange(plugin, context.sourcePath, source, node.contentStart, node.contentEnd, node.children, container, component);
    finishContainer(container);
  } catch (error) {
    component.unload();
    element.removeClass("ibc-container-host");
    element.innerHTML = originalHtml;
    console.error("Ignorance Advanced: ::: 容器渲染失败 —", error);
  }
}

function renderContainerBlocks(plugin, element, context) {
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
