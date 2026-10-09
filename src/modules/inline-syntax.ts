import { readAsset } from "./assets.js";
import { parseInlineSyntax } from "./inline-syntax-source.js";

const ICON_ALIAS = { chart: "chart-column-increasing" };
const ICON_TAGS = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);
const ICON_ATTRS = new Set([
  "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule",
  "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "x2", "y1", "y2", "width", "height", "points",
  "transform", "opacity", "vector-effect"
]);
const iconDataCache = new Map<string, Promise<any>>();

function loadLucideIconData(plugin) {
  const path = `${plugin.manifest.dir}/lucide-icons.json`;
  if (!iconDataCache.has(path)) {
    const pending = readAsset(plugin, "lucide-icons.json").then(text => JSON.parse(text)).catch(error => {
      iconDataCache.delete(path);
      throw error;
    });
    iconDataCache.set(path, pending);
  }
  return iconDataCache.get(path);
}

function iconNames(data) {
  return new Set([...Object.keys(data.icons || {}), ...Object.keys(data.aliases || {}), ...Object.keys(ICON_ALIAS)]);
}

function resolveIconName(name, data) {
  let current = ICON_ALIAS[name] || name;
  const seen = new Set();
  while (!data.icons?.[current] && data.aliases?.[current] && !seen.has(current)) {
    seen.add(current);
    const alias = data.aliases[current];
    current = typeof alias === "string" ? alias : alias.parent;
  }
  return data.icons?.[current] ? current : null;
}

function safeSvgChild(source, target) {
  if (source.nodeType !== 1) return null;
  const name = source.localName.toLowerCase();
  if (!ICON_TAGS.has(name)) return null;
  const clone = target.createElementNS("http://www.w3.org/2000/svg", name);
  for (const attribute of source.attributes) {
    const key = attribute.name.toLowerCase();
    const value = attribute.value;
    if (!ICON_ATTRS.has(key)) continue;
    if ((key === "fill" || key === "stroke") && !/^(?:none|currentColor|#[\da-f]{3,8}|[a-z]+)$/i.test(value)) continue;
    if (key === "transform" && !/^[\w\s.,()+\-]+$/.test(value)) continue;
    if (key === "d" && !/^[\w\s.,+\-]*$/i.test(value)) continue;
    clone.setAttribute(key, value);
  }
  for (const child of source.children) {
    const safe = safeSvgChild(child, target);
    if (safe) clone.appendChild(safe);
  }
  return clone;
}

function makeIconElement(name, data, doc = document) {
  const resolved = resolveIconName(name, data);
  if (!resolved) return null;
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${data.icons[resolved].body}</svg>`, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return null;
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ib-inline-icon");
  svg.dataset.ibIcon = name;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const child of parsed.documentElement.children) {
    const safe = safeSvgChild(child, doc);
    if (safe) svg.appendChild(safe);
  }
  return svg;
}

function pointList(values) {
  const width = 100, height = 24, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (width - 2 * pad) * (values.length === 1 ? 0 : index / (values.length - 1));
    const y = pad + (height - 2 * pad) * (1 - (value - min) / span);
    return [x, y];
  });
  return { points, string: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") };
}

function makeChipElement(token, doc = document) {
  if (token.type === "pill") {
    const pill = doc.createElement("span");
    pill.className = `ib-inline-chip ib-inline-chip--${token.color || "neutral"}`;
    pill.textContent = token.value;
    return pill;
  }
  if (token.type === "bar") {
    const bar = doc.createElement("span");
    bar.className = "ib-inline-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${token.label ? `${token.label}：` : ""}${token.percent}%`);
    if (token.label) {
      const label = doc.createElement("span");
      label.className = "ib-inline-bar__label";
      label.textContent = token.label;
      bar.appendChild(label);
    }
    const track = doc.createElement("span");
    track.className = "ib-inline-bar__track";
    const fill = doc.createElement("span");
    fill.className = "ib-inline-bar__fill";
    fill.style.width = `${token.percent}%`;
    track.appendChild(fill);
    bar.appendChild(track);
    const value = doc.createElement("span");
    value.className = "ib-inline-bar__value";
    value.textContent = `${token.percent}%`;
    bar.appendChild(value);
    return bar;
  }
  const spark = doc.createElement("span");
  spark.className = "ib-inline-spark";
  spark.setAttribute("role", "img");
  spark.setAttribute("aria-label", `趋势：${token.values.join("，")}`);
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 24");
  svg.setAttribute("aria-hidden", "true");
  const { points, string } = pointList(token.values);
  const line = doc.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", string);
  svg.appendChild(line);
  const [x, y] = points[points.length - 1];
  const dot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("class", "ib-inline-spark__dot");
  dot.setAttribute("cx", x.toFixed(1));
  dot.setAttribute("cy", y.toFixed(1));
  dot.setAttribute("r", "2");
  svg.appendChild(dot);
  spark.appendChild(svg);
  return spark;
}

function makeTokenElement(token, data, doc = document) {
  if (token.kind === "chip") return makeChipElement(token, doc);
  const wrapper = doc.createElement("span");
  wrapper.className = "ib-inline-icon-wrap";
  const icon = makeIconElement(token.icon, data, doc);
  if (icon) wrapper.appendChild(icon);
  else wrapper.appendChild(doc.createTextNode(token.source));
  return wrapper;
}

function excludedTextNode(node) {
  const parent = node.parentElement;
  return !parent || !!parent.closest("code, pre, a, script, style, svg, .math, .mermaid, .ibc-container-source-covered");
}

async function renderInlineSyntax(plugin, root) {
  const hasIconSyntax = /:[a-z][a-z0-9-]*:/i.test(root.textContent || "");
  let data = { icons: {}, aliases: {} };
  if (hasIconSyntax) {
    try { data = await loadLucideIconData(plugin); } catch (error) {
      console.error("Ignorance Advanced: Lucide 图标数据读取失败 —", error);
    }
  }
  const names = hasIconSyntax ? iconNames(data) : null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) if (!excludedTextNode(walker.currentNode)) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const source = node.nodeValue || "";
    if (!source.includes("((") && !source.includes(":")) continue;
    const tokens = parseInlineSyntax(source, names);
    if (!tokens.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) fragment.appendChild(document.createTextNode(source.slice(cursor, token.start)));
      fragment.appendChild(makeTokenElement(token, data));
      cursor = token.end;
    }
    if (cursor < source.length) fragment.appendChild(document.createTextNode(source.slice(cursor)));
    node.replaceWith(fragment);
  }
}

export { loadLucideIconData, iconNames, resolveIconName, makeIconElement, makeChipElement, makeTokenElement, renderInlineSyntax };
