import type { IgnorancePlugin } from "../plugin-types.js";
import { readAsset } from "./assets.js";
import { parseInlineSyntax, type InlineSyntaxToken } from "./inline-syntax-source.js";

const ICON_ALIAS: Record<string, string> = { chart: "chart-column-increasing" };
const ICON_TAGS = new Set<string>(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);
const ICON_ATTRS = new Set([
  "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule",
  "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "x2", "y1", "y2", "width", "height", "points",
  "transform", "opacity", "vector-effect"
]);
// The bundled Lucide pack: icon bodies by name, plus aliases (a name, or an object pointing at its parent).
interface IconData { icons?: Record<string, { body: string }>; aliases?: Record<string, string | { parent: string }> }
const iconDataCache = new Map<string, Promise<IconData>>();
const isIconTag = (name: string): name is keyof SVGElementTagNameMap => ICON_TAGS.has(name);

function loadLucideIconData(plugin: IgnorancePlugin) {
  const path = `${plugin.manifest.dir}/lucide-icons.json`;
  if (!iconDataCache.has(path)) {
    const pending = readAsset(plugin, "lucide-icons.json").then(text => JSON.parse(text) as IconData).catch(error => {
      iconDataCache.delete(path);
      throw error;
    });
    iconDataCache.set(path, pending);
  }
  return iconDataCache.get(path);
}

function iconNames(data: IconData) {
  return new Set([...Object.keys(data.icons || {}), ...Object.keys(data.aliases || {}), ...Object.keys(ICON_ALIAS)]);
}

function resolveIconName(name: string, data: IconData) {
  let current = ICON_ALIAS[name] || name;
  const seen = new Set<string>();
  while (!data.icons?.[current] && data.aliases?.[current] && !seen.has(current)) {
    seen.add(current);
    const alias = data.aliases[current];
    current = typeof alias === "string" ? alias : alias.parent;
  }
  return data.icons?.[current] ? current : null;
}

function safeSvgChild(source: Element) {
  if (source.nodeType !== 1) return null;
  const name = source.localName.toLowerCase();
  if (!isIconTag(name)) return null;
  const clone = createSvg(name);
  for (const attribute of source.attributes) {
    const key = attribute.name.toLowerCase();
    const value = attribute.value;
    if (!ICON_ATTRS.has(key)) continue;
    if ((key === "fill" || key === "stroke") && !/^(?:none|currentColor|#[\da-f]{3,8}|[a-z]+)$/i.test(value)) continue;
    if (key === "transform" && !/^[\w\s.,()+-]+$/.test(value)) continue;
    if (key === "d" && !/^[\w\s.,+-]*$/i.test(value)) continue;
    clone.setAttribute(key, value);
  }
  for (const child of source.children) {
    const safe = safeSvgChild(child);
    if (safe) clone.appendChild(safe);
  }
  return clone;
}

function makeIconElement(name: string, data: IconData) {
  const resolved = resolveIconName(name, data);
  if (!resolved) return null;
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${data.icons[resolved].body}</svg>`, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return null;
  const svg = createSvg("svg");
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
    const safe = safeSvgChild(child);
    if (safe) svg.appendChild(safe);
  }
  return svg;
}

function pointList(values: number[]) {
  const width = 100, height = 24, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const points = values.map((value: number, index: number) => {
    const x = pad + (width - 2 * pad) * (values.length === 1 ? 0 : index / (values.length - 1));
    const y = pad + (height - 2 * pad) * (1 - (value - min) / span);
    return [x, y];
  });
  return { points, string: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") };
}

function makeChipElement(token: InlineSyntaxToken) {
  if (token.type === "pill") {
    const pill = createSpan();
    pill.className = `ib-inline-chip ib-inline-chip--${token.color || "neutral"}`;
    pill.textContent = token.value;
    return pill;
  }
  if (token.type === "badge") {
    const badge = createSpan();
    badge.className = `ib-inline-badge ib-inline-badge--${token.color || "neutral"}`;
    const label = createSpan();
    label.className = "ib-inline-badge__label";
    label.textContent = token.value;
    const value = createSpan();
    value.className = "ib-inline-badge__value";
    value.textContent = token.note;
    badge.append(label, value);
    return badge;
  }
  if (token.type === "ref") {
    // Filled in with the figure or table label by the captions pass; until then it shows the reference name.
    const ref = createEl("a");
    ref.className = "ib-inline-ref";
    ref.dataset.ibRef = token.value;
    ref.setAttribute("href", "#");
    ref.textContent = token.label || token.value;
    return ref;
  }
  if (token.type === "spoiler") {
    const spoiler = createSpan();
    spoiler.className = "ib-inline-spoiler";
    spoiler.tabIndex = 0;
    spoiler.setAttribute("role", "button");
    spoiler.setAttribute("aria-label", "点击显示隐藏内容");
    spoiler.textContent = token.value;
    spoiler.addEventListener("click", () => spoiler.classList.toggle("is-revealed"));
    spoiler.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); spoiler.classList.toggle("is-revealed"); }
    });
    return spoiler;
  }
  if (token.type === "ruby") {
    const ruby = createEl("ruby");
    ruby.className = "ib-inline-ruby";
    ruby.append(token.value);
    const open = createEl("rp");
    open.textContent = "(";
    const note = createEl("rt");
    note.textContent = token.note;
    const close = createEl("rp");
    close.textContent = ")";
    ruby.append(open, note, close);
    return ruby;
  }
  if (token.type === "crumb") {
    const crumb = createSpan();
    crumb.className = "ib-inline-crumb";
    crumb.title = "点击复制路径";
    crumb.addEventListener("click", () => { void navigator.clipboard?.writeText(token.parts.join(" > ")).catch(() => {}); });
    token.parts.forEach((part: string, index: number) => {
      if (index) {
        const separator = createSpan();
        separator.className = "ib-inline-crumb__sep";
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "›";
        crumb.appendChild(separator);
      }
      const item = createSpan();
      item.className = "ib-inline-crumb__item";
      item.textContent = part;
      crumb.appendChild(item);
    });
    return crumb;
  }
  if (token.type === "bar") {
    const bar = createSpan();
    bar.className = "ib-inline-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${token.label ? `${token.label}：` : ""}${token.percent}%`);
    if (token.label) {
      const label = createSpan();
      label.className = "ib-inline-bar__label";
      label.textContent = token.label;
      bar.appendChild(label);
    }
    const track = createSpan();
    track.className = "ib-inline-bar__track";
    const fill = createSpan();
    fill.className = "ib-inline-bar__fill";
    fill.style.width = `${token.percent}%`;
    track.appendChild(fill);
    bar.appendChild(track);
    const value = createSpan();
    value.className = "ib-inline-bar__value";
    value.textContent = `${token.percent}%`;
    bar.appendChild(value);
    return bar;
  }
  const spark = createSpan();
  spark.className = "ib-inline-spark";
  spark.setAttribute("role", "img");
  spark.setAttribute("aria-label", `趋势：${token.values.join("，")}`);
  const svg = createSvg("svg");
  svg.setAttribute("viewBox", "0 0 100 24");
  svg.setAttribute("aria-hidden", "true");
  const { points, string } = pointList(token.values);
  const line = createSvg("polyline");
  line.setAttribute("points", string);
  svg.appendChild(line);
  const [x, y] = points[points.length - 1];
  const dot = createSvg("circle");
  dot.setAttribute("class", "ib-inline-spark__dot");
  dot.setAttribute("cx", x.toFixed(1));
  dot.setAttribute("cy", y.toFixed(1));
  dot.setAttribute("r", "2");
  svg.appendChild(dot);
  spark.appendChild(svg);
  return spark;
}

function makeTokenElement(token: InlineSyntaxToken, data: IconData) {
  if (token.kind === "chip") return makeChipElement(token);
  const wrapper = createSpan();
  wrapper.className = "ib-inline-icon-wrap";
  const icon = makeIconElement(token.icon, data);
  if (icon) wrapper.appendChild(icon);
  else wrapper.appendChild(document.createTextNode(token.source));
  return wrapper;
}

function excludedTextNode(node: Node) {
  const parent = node.parentElement;
  return !parent || !!parent.closest("code, pre, a, script, style, svg, .math, .mermaid, .ibc-container-source-covered");
}

async function renderInlineSyntax(plugin: IgnorancePlugin, root: HTMLElement) {
  const hasIconSyntax = /:[a-z][a-z0-9-]*:/i.test(root.textContent || "");
  let data: IconData = { icons: {}, aliases: {} };
  if (hasIconSyntax) {
    try { data = await loadLucideIconData(plugin); } catch (error) {
      console.error("Ignorance Advanced: Lucide 图标数据读取失败 —", error);
    }
  }
  const names = hasIconSyntax ? iconNames(data) : null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.instanceOf(Text) && !excludedTextNode(node)) textNodes.push(node);
  }

  for (const node of textNodes) {
    const source = node.nodeValue || "";
    if (!source.includes("((") && !source.includes(":")) continue;
    const tokens = parseInlineSyntax(source, names);
    if (!tokens.length) continue;
    const fragment = createFragment();
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
