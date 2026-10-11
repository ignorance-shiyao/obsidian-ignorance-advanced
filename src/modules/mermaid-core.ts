import { withClassElkSpacing } from "./class-elk-spacing.js";
import { withClassBoxMeasurement } from "./class-box-measurement.js";
import { withMermaidConfigIsolation } from "./mermaid-config-isolation.js";
import { layoutWardleyNotes, restoreWardleyNotes } from "./wardley-note-layout.js";
import { parseYaml } from "obsidian";
import { withWardleyFontConfig } from "./wardley-font-config.js";
import { readAsset } from "./assets.js";
import { Decoration } from "@codemirror/view";
import { mapArchitectureIcons, registerLucideIcons } from "./architecture-icons.js";
import { avoidC4LabelNodes } from "./c4-label-layout.js";
import { ganttTickInterval } from "./gantt-axis.js";
import { withClassNoteLayout } from "./class-note-layout.js";

const TOKEN_CLASSES = {
  fence: Decoration.mark({ class: "ibm-mermaid-fence" }),
  keyword: Decoration.mark({ class: "ibm-mermaid-keyword" }),
  node: Decoration.mark({ class: "ibm-mermaid-node" }),
  label: Decoration.mark({ class: "ibm-mermaid-label" }),
  string: Decoration.mark({ class: "ibm-mermaid-string" }),
  number: Decoration.mark({ class: "ibm-mermaid-number" }),
  property: Decoration.mark({ class: "ibm-mermaid-property" }),
  operator: Decoration.mark({ class: "ibm-mermaid-operator" }),
  punctuation: Decoration.mark({ class: "ibm-mermaid-punctuation" }),
  comment: Decoration.mark({ class: "ibm-mermaid-comment" })
};

const TOKEN_PATTERNS = [
  ["punctuation", /[\[\]{}()]/g],
  ["operator", /(?:<-->|-->|<--|---|==>|-\.->|--o|--x|~~~|:::)/g],
  ["number", /\b\d+(?:\.\d+)?(?:px|%)?\b/g],
  ["property", /\b(?:fill|stroke|stroke-width|color|background|font-size|font-weight|opacity)\b(?=\s*:)/gi],
  ["node", /\b[A-Za-z_][\w-]*(?=\s*[\[({])/g],
  ["keyword", /\b(?:flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|TB|TD|BT|RL|LR)\b/gi],
  ["label", /(?<=[\[({])[^\[\]{}()\r\n]+(?=[\])}])/g],
  ["string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g],
  ["number", /#[0-9a-fA-F]{3,8}\b/g],
  ["comment", /%%.*$/g]
];

function tokenRuns(text) {
  const classes = new Array(text.length).fill(null);
  for (const [tokenClass, pattern] of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      for (let index = start; index < end; index += 1) classes[index] = tokenClass;
    }
  }

  const runs = [];
  let start = 0;
  while (start < classes.length) {
    const tokenClass = classes[start];
    let end = start + 1;
    while (end < classes.length && classes[end] === tokenClass) end += 1;
    if (tokenClass) runs.push({ start, end, tokenClass });
    start = end;
  }
  return runs;
}

function buildMermaidDecorations(view) {
  const ranges = [];
  const doc = view.state.doc;
  let inMermaid = false;
  let fenceMarker = "```";

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const opening = line.text.match(/^\s*(`{3,}|~{3,})\s*mermaid\b/i);

    if (!inMermaid && opening) {
      inMermaid = true;
      fenceMarker = opening[1][0].repeat(opening[1].length);
      ranges.push(TOKEN_CLASSES.fence.range(line.from, line.to));
      continue;
    }

    if (!inMermaid) continue;

    const closing = new RegExp(`^\\s*${fenceMarker[0]}{${fenceMarker.length},}\\s*$`);
    if (closing.test(line.text)) {
      ranges.push(TOKEN_CLASSES.fence.range(line.from, line.to));
      inMermaid = false;
      continue;
    }

    for (const run of tokenRuns(line.text)) {
      ranges.push(TOKEN_CLASSES[run.tokenClass].range(line.from + run.start, line.from + run.end));
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

/* --------------------------------------------------------------------------
 * Diagram structure tags
 *
 * All diagram colors and shapes live in the Ignorance theme (see the
 * "Mermaid diagrams" section of theme.css). The plugin only does what CSS
 * cannot:
 *   - data-ibm-group="1..8" on nodes that sit inside a cluster (Mermaid draws
 *     nodes outside the cluster's DOM, so membership is geometric);
 *   - data-ibm-series="1..8" on marks of series diagrams, in Mermaid's own
 *     grouping, plus data-ibm-stroked / data-ibm-on-mark;
 *   - a rounded card behind class boxes (their outline is a path);
 *   - a generic dark-mode tone mapping for families the theme does not know.
 * -------------------------------------------------------------------------- */

/* Families whose geometry the theme restyles structurally. */
const STRUCTURAL_KINDS = new Set([
  "flowchart", "flowchart-v2", "graph", "swimlane", "er", "sequence", "gantt",
  "class", "classDiagram", "stateDiagram", "state", "requirement",
  "c4", "gitGraph", "git", "block", "kanban", "architecture"
]);

/* Families that carry meaning in a categorical ramp. */
const SERIES_KINDS = new Set([
  "pie", "journey", "xychart", "radar", "sankey", "treemap", "venn",
  "quadrantChart", "packet", "mindmap", "timeline"
]);

const SERIES_MARKS = [
  "path.pieCircle", ".slice", ".journey-section", ".plot .bar", ".plot rect",
  ".radar-graph path", ".node-rect", ".sankey-link", ".treemapSection",
  ".venn-circle", ".quadrant", ".packetBlock",
  "g.mindmap-node path.node-bkg", "g.mindmap-node circle", "g.mindmap-node rect",
  "g.timeline-node path.node-bkg", "path.section-edge-0", "path.section-edge-1",
  "path.section-edge-2", "path.section-edge-3"
].join(", ");
const SERIES_SWATCHES = ".legend rect, g.legend rect, .legend .swatch, .legendColor";

/* Families with their own block in theme.css; the generic dark tone mapping
   must not paint over them. */
const THEMED_KINDS = new Set([
  "usecase", "zenuml", "eventmodeling", "ishikawa", "wardley", "treeView"
]);

/* C4 writes its default palette inline with !important, which no stylesheet
   can beat. Only these exact defaults are stripped (and the role recorded for
   the theme); any other inline color is the author's UpdateElementStyle. */
const C4_DEFAULTS = {
  "#08427b": "person", "#073b6f": "person",
  "#1168bd": "system", "#3c7fc0": "system",
  "#999999": "external", "#8a8a8a": "external",
  "#686868": "external"
};

const PERSON_GLYPH = "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v1.5h16V19c0-2.8-3.6-5-8-5z";
const SVG_NS_C4 = "http://www.w3.org/2000/svg";

function cssColorToRgb(value) {
  if (!value) return null;
  const probe = document.createElement("span");
  probe.style.color = value;
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const rgb = parseColor(getComputedStyle(probe).color);
  probe.remove();
  return rgb;
}

function authorPersonColor(shapes) {
  const style = shapes.map(shape => shape.getAttribute("style") || "").join(";");
  const pick = prop => new RegExp(`${prop}:\\s*([^;!]+)`, "i").exec(style)?.[1]?.trim();
  const candidates = [pick("stroke"), pick("fill")].filter(Boolean);
  for (const value of candidates) {
    const rgb = cssColorToRgb(value);
    if (rgb && rgbToHsl(rgb).s > 0.25) return value;
  }
  return candidates[1] || candidates[0] || null;
}

function stashStyle(element) {
  if (!element.hasAttribute("data-ibm-c4-style")) element.setAttribute("data-ibm-c4-style", element.getAttribute("style") || "");
}

function adoptC4Defaults(svg) {
  for (const rect of svg.querySelectorAll('g > rect[fill="#1168BD"]')) rect.parentElement.setAttribute("data-ibm-c4-system", "");
  for (const node of svg.querySelectorAll("g.node")) {
    const shapes = [...node.querySelectorAll(":scope > g.basic :is(rect, path, circle, ellipse)[style], :scope > :is(rect, path)[style]")];
    let role = null;
    for (const shape of shapes) {
      const style = shape.getAttribute("style") || "";
      const fill = /fill:\s*(#[0-9a-f]{6})/i.exec(style)?.[1]?.toLowerCase();
      const stroke = /stroke:\s*(#[0-9a-f]{6})/i.exec(style)?.[1]?.toLowerCase();
      const found = C4_DEFAULTS[fill];
      if (!found || (stroke && !C4_DEFAULTS[stroke])) continue;
      role = found;
      stashStyle(shape);
      shape.style.removeProperty("fill");
      shape.style.removeProperty("stroke");
    }
    const isPerson = !!node.querySelector(":scope > g.basic circle");
    if (!role && isPerson) {
      // A person the author recolored (UpdateElementStyle) still gets the card
      // and avatar treatment, in the author's color: the stroke when it has a
      // hue, otherwise the fill.
      const accent = authorPersonColor(shapes);
      if (!accent) continue;
      role = "person";
      node.style.setProperty("--c4-person", accent);
      node.setAttribute("data-ibm-c4-custom", "");
      for (const shape of shapes) {
        stashStyle(shape);
        shape.style.removeProperty("fill");
        shape.style.removeProperty("stroke");
      }
    }
    if (!role) continue; // author-styled system: leave every color alone
    node.setAttribute("data-ibm-c4", role);
    // Person-style cards (they carry an avatar disc) use dark text; the theme selects on this instead of :has(circle).
    if (node.querySelector("circle")) node.setAttribute("data-ibm-c4-disc", "");

    // Mermaid also pins the label text white; let the theme decide.
    for (const label of node.querySelectorAll("[style*='#FFFFFF' i]")) {
      stashStyle(label);
      label.style.removeProperty("color");
      label.style.removeProperty("fill");
    }

    // Person: a smaller avatar disc riding on the card's top edge, with a glyph.
    const circle = node.querySelector(":scope > g.basic circle");
    const card = node.querySelector(":scope > g.basic rect");
    if (circle && card) {
      circle.setAttribute("data-ibm-c4-geom", `${circle.getAttribute("cy")}|${circle.getAttribute("r")}`);
      const r = 24;
      const cy = Number(card.getAttribute("y")) - r + 8;
      circle.setAttribute("r", r);
      circle.setAttribute("cy", cy);
      const glyph = document.createElementNS(SVG_NS_C4, "path");
      glyph.setAttribute("class", "ibm-c4-avatar");
      glyph.setAttribute("d", PERSON_GLYPH);
      const k = 1.3;
      glyph.setAttribute("transform", `translate(${Number(circle.getAttribute("cx")) - 12 * k},${cy - 11 * k}) scale(${k})`);
      circle.after(glyph);
    }
  }
}

const CLUSTER_GROUPS = "g.cluster, g.statediagram-cluster, g.subgraph";
const TAG_ATTRS = ["data-ibm-group", "data-ibm-series", "data-ibm-stroked", "data-ibm-on-mark", "data-ibm-carded", "data-ibm-c4", "data-ibm-arch-group", "data-ibm-c4-disc", "data-ibm-c4-system", "data-ibm-members", "data-ibm-note", "data-ibm-class-kind"];
const SVG_NS = "http://www.w3.org/2000/svg";

function diagramKind(svg) {
  return svg.getAttribute("aria-roledescription") || "";
}

/* Mermaid tags mindmap/timeline branches with section-N; honor that grouping so
   sibling nodes share a color instead of cycling per shape. */
function seriesIndex(element, fallback) {
  const owner = element.closest("[class*='section-']") || element;
  const match = /(?:^|\s)section-{0,2}(-?\d+)/.exec(owner.getAttribute("class") || "");
  if (!match) return fallback;
  const value = Number(match[1]);
  return value < 0 ? 0 : value;
}

function slot(index) {
  return String((index % 8) + 1);
}

function applyPaint(element, props) {
  const applied = [];
  for (const [property, value] of Object.entries(props)) {
    if (!value) continue;
    element.style.setProperty(property, value, "important");
    applied.push(property);
  }
  if (applied.length) element.setAttribute("data-ibm-painted", applied.join(" "));
}

function clearPaint(svg) {
  restoreWardleyNotes(svg);
  for (const label of svg.querySelectorAll("[data-ibm-note-label-transform]")) {
    const transform = label.getAttribute("data-ibm-note-label-transform");
    if (transform) label.setAttribute("transform", transform);
    else label.removeAttribute("transform");
    label.removeAttribute("data-ibm-note-label-transform");
  }
  // Restore notes enhanced by the previous fixed 16px shift as well.
  for (const label of svg.querySelectorAll("g.node [data-ibm-shifted]")) {
    const at = parseTranslate(label);
    if (at) label.setAttribute("transform", `translate(${at.x - 16},${at.y})`);
    label.removeAttribute("data-ibm-shifted");
  }
  for (const title of svg.querySelectorAll("[data-ibm-c4-title-y]")) {
    title.setAttribute("y", title.getAttribute("data-ibm-c4-title-y"));
    title.removeAttribute("data-ibm-c4-title-y");
  }
  for (const label of svg.querySelectorAll("[data-ibm-c4-label-position]")) {
    const [x, y] = label.getAttribute("data-ibm-c4-label-position").split("|");
    label.setAttribute("x", x); label.setAttribute("y", y);
    label.removeAttribute("data-ibm-c4-label-position");
  }
  for (const element of svg.querySelectorAll("[data-ibm-painted]")) {
    for (const property of element.getAttribute("data-ibm-painted").split(" ")) {
      element.style.removeProperty(property);
    }
    element.removeAttribute("data-ibm-painted");
  }
  for (const attr of TAG_ATTRS) {
    for (const element of svg.querySelectorAll(`[${attr}]`)) element.removeAttribute(attr);
  }
  svg.querySelectorAll("rect.ibm-class-card, path.ibm-class-head, path.ibm-class-icon, rect.ibm-note-card, path.ibm-note-icon").forEach(element => element.remove());
  for (const style of svg.querySelectorAll("style[data-ibm-style-text]")) {
    style.textContent = style.getAttribute("data-ibm-style-text");
    style.removeAttribute("data-ibm-style-text");
  }
  for (const shape of svg.querySelectorAll("[data-ibm-c4-style]")) {
    shape.setAttribute("style", shape.getAttribute("data-ibm-c4-style"));
    shape.removeAttribute("data-ibm-c4-style");
  }
  for (const circle of svg.querySelectorAll("[data-ibm-c4-geom]")) {
    const [cy, r] = circle.getAttribute("data-ibm-c4-geom").split("|");
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", r);
    circle.removeAttribute("data-ibm-c4-geom");
  }
  svg.querySelectorAll("path.ibm-c4-avatar").forEach(element => element.remove());
  for (const node of svg.querySelectorAll("[data-ibm-c4-custom]")) {
    node.style.removeProperty("--c4-person");
    node.removeAttribute("data-ibm-c4-custom");
  }
  svg.removeAttribute("data-ibm-theme");
}
/* Mermaid writes some colors and sizes as inline styles, and pins others with `!important` inside the SVG's own
   <style>. Both beat any ordinary selector, so the theme would need `!important` to restyle them. They are released
   here instead, and the theme uses plain selectors. The originals are stashed and put back by clearPaint. */
const RELEASE_INLINE = {
  quadrantChart: [["g.border line", ["stroke", "stroke-width"]]],
  treemap: [["text.treemapSectionLabel, text.treemapSectionValue, text.treemapLabel, text.treemapValue", ["fill", "stroke"]]],
  venn: [["text.label", ["font-size"]]],
  pie: [["g.legend rect", ["fill", "stroke"]]]
};

function releaseInlineStyles(svg, kind) {
  for (const [selector, properties] of RELEASE_INLINE[kind] || []) {
    for (const element of svg.querySelectorAll(selector)) {
      stashStyle(element);
      for (const property of properties) element.style.removeProperty(property);
    }
  }
  if (kind === "architecture") {
    // The service-group boxes are told apart by their inline fill, which is released with it.
    for (const rect of svg.querySelectorAll('svg rect[style*="#087ebf" i]')) {
      rect.setAttribute("data-ibm-arch-group", "");
      stashStyle(rect);
      rect.style.removeProperty("fill");
    }
  }
  if (kind === "gantt") {
    for (const style of svg.querySelectorAll("style")) {
      if (!style.hasAttribute("data-ibm-style-text")) style.setAttribute("data-ibm-style-text", style.textContent);
      style.textContent = style.getAttribute("data-ibm-style-text").replace(/\s*!important/g, "");
    }
  }
}

/* Plugin-built decorations survive a repaint (they carry no colors); the
   data-ibm-*-fixed / -table markers keep them from being built twice. */

function paintDiagram(svg, isDark) {
  const kind = diagramKind(svg);
  clearPaint(svg);
  const structural = STRUCTURAL_KINDS.has(kind);
  const series = SERIES_KINDS.has(kind);

  releaseInlineStyles(svg, kind);
  if (structural) tagGroups(svg);
  if (kind === "class" || kind === "classDiagram") drawClassCards(svg);
  if (series) tagSeries(svg);
  if (kind === "treemap") whenMeasurable(svg, () => tagTreemapLeaves(svg));
  if (kind === "architecture") spreadArchitectureServices(svg);
  if (kind === "venn") whenMeasurable(svg, () => { separateVennLabels(svg); fitVennTitle(svg); addTextBackplates(svg, "text.label"); });
  if (kind === "sankey") whenMeasurable(svg, () => separateSankeyLabels(svg));
  if (kind === "journey") arrangeJourneyFaces(svg);
  if (kind === "gantt") markGanttSections(svg);
  if (kind === "wardley") whenMeasurable(svg, () => layoutWardleyNotes(svg));
  if (kind === "pie") buildPieTable(svg);
  if (kind === "requirement") drawRequirementCards(svg);
  if (kind === "usecase") decorateUsecase(svg);
  if (kind === "flowchart-v2" || kind === "flowchart" || kind === "graph" || kind === "swimlane") decorateFlowchart(svg);
  if (kind === "swimlane") decorateSwimlanes(svg);
  if (kind === "sequence") {
    decorateSequence(svg);
    whenMeasurable(svg, () => addTextBackplates(svg, "text.messageText"));
  }
  if (kind === "c4") {
    adoptC4Defaults(svg);
    whenMeasurable(svg, () => { compactC4Title(svg); separateC4Labels(svg); });
  }
  if (isDark && !structural && !series && !THEMED_KINDS.has(kind)) toneMapForDark(svg, themeTokens());

  svg.setAttribute("data-ibm-theme", isDark ? "dark" : "light");
}

/* Cluster k (its position among siblings, the same count CSS nth-child uses)
   lends its hue to every node whose centre lies inside it; nested clusters
   win over their parents. */
/* --------------------------------------------------------------------------
 * Layout repairs CSS cannot make
 * -------------------------------------------------------------------------- */

function parseTranslate(element) {
  const m = /translate\(\s*(-?[\d.e+-]+)[,\s]+(-?[\d.e+-]+)\s*\)/.exec(element.getAttribute("transform") || "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/* Architecture: the layout pins services by their port directions, so
   several services wired to the same side of one neighbour land on the same
   spot, and groups can end up overlapping. Resolve it on the drawn SVG:
   push overlapping services apart inside their group, grow each group to
   hold its members, push overlapping groups apart, then re-point every edge
   end that moved. Services only ever move down, so titles stay put. */
function spreadArchitectureServices(svg) {
  if (svg.hasAttribute("data-ibm-arch-fixed")) return;
  svg.setAttribute("data-ibm-arch-fixed", "");
  const SIZE = 80, LABEL = 48, GAP = 24;
  const num = (el, attr) => Number(el.getAttribute(attr));

  const services = [...svg.querySelectorAll("g.architecture-service")]
    .map(node => ({ node, name: (node.id || "").replace(/^.*-service-/, ""), pos: parseTranslate(node), dy: 0 }))
    .filter(entry => entry.pos);
  const groups = [...svg.querySelectorAll("g.architecture-groups > rect.node-bkg")].map(rect => ({
    rect, deco: rect.nextElementSibling, x: num(rect, "x"), y: num(rect, "y"), w: num(rect, "width"), h: num(rect, "height"), dy: 0, members: []
  }));
  for (const service of services) {
    const cx = service.pos.x + SIZE / 2, cy = service.pos.y + SIZE / 2;
    const home = groups.filter(g => cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h)
      .sort((p, q) => p.w * p.h - q.w * q.h)[0];
    if (home) home.members.push(service);
    service.group = home || null;
  }
  const top = s => s.pos.y + s.dy;
  const bottom = s => top(s) + SIZE + LABEL;
  for (const g of groups) {
    g.padBottom = g.members.length ? Math.max(16, g.y + g.h - Math.max(...g.members.map(bottom))) : 16;
  }

  // 1. Services inside the same group.
  for (let pass = 0; pass < 30; pass += 1) {
    let moved = false;
    const ordered = [...services].sort((p, q) => top(p) - top(q) || p.pos.x - q.pos.x);
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i], b = ordered[j];
        if (a.group !== b.group) continue;
        if (Math.abs(a.pos.x - b.pos.x) >= SIZE + GAP) continue;
        const overlap = bottom(a) + GAP - top(b);
        if (overlap <= 0) continue;
        b.dy += overlap;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // 2. Groups grow to hold their members.
  for (const g of groups) {
    if (!g.members.length) continue;
    const need = Math.max(...g.members.map(bottom)) + g.padBottom - (g.y + g.h);
    if (need > 0) g.h += need;
  }

  // 3. Overlapping groups: push the lower one (and its members) down.
  const gTop = g => g.y + g.dy, gBottom = g => g.y + g.dy + g.h;
  for (let pass = 0; pass < 30; pass += 1) {
    let moved = false;
    const ordered = [...groups].sort((p, q) => gTop(p) - gTop(q));
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i], b = ordered[j];
        if (a.x >= b.x + b.w || b.x >= a.x + a.w) continue;
        // Nested groups are containment, not collision.
        if (b.x >= a.x && b.x + b.w <= a.x + a.w && gTop(b) >= gTop(a) && gBottom(b) <= gBottom(a)) continue;
        const overlap = gBottom(a) + GAP / 2 - gTop(b);
        if (overlap <= 0) continue;
        b.dy += overlap;
        for (const m of b.members) m.dy += overlap;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // 4. Apply.
  for (const g of groups) {
    g.rect.setAttribute("y", g.y + g.dy);
    g.rect.setAttribute("height", g.h);
    if (g.dy && g.deco) g.deco.setAttribute("transform", `translate(0,${g.dy})`);
  }
  for (const service of services) {
    if (!service.dy) continue;
    service.node.setAttribute("transform", `translate(${service.pos.x},${service.pos.y + service.dy})`);
    shiftEdgeEnds(svg, service.name, service.dy);
  }
}

function shiftEdgeEnds(svg, name, dy) {
  for (const path of svg.querySelectorAll("path.edge")) {
    const id = (path.id || "").replace(/^.*?-L_/, "L_");
    const m = /^L_(.+)_(.+)_\d+$/.exec(id);
    if (!m || (m[1] !== name && m[2] !== name)) continue;
    const points = [...(path.getAttribute("d") || "").matchAll(/(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map(p => ({ x: Number(p[1]), y: Number(p[2]) }));
    if (points.length < 2) continue;
    const start = points[0], end = points[points.length - 1];
    if (m[1] === name) start.y += dy;
    if (m[2] === name) end.y += dy;
    // A soft S-curve between the moved ends, in keeping with the theme.
    const midX = (start.x + end.x) / 2;
    path.setAttribute("d", `M ${start.x},${start.y} C ${midX},${start.y} ${midX},${end.y} ${end.x},${end.y}`);
  }
}

/* Venn: intersection labels are placed at region centres without regard to
   their width. Push colliding labels apart vertically. */
/* Measure immediately when the SVG already has geometry (also covers staged
   export and early rendering); otherwise wait until it becomes visible. Run
   once more after fonts load because label widths may change. */
function whenMeasurable(svg, fix) {
  const run = () => {
    let width = 0;
    try { width = svg.getBBox().width; } catch (_) { /* detached */ }
    if (width) fix();
    return width > 0;
  };
  if (run()) {
    document.fonts?.ready.then(run);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    if (!run()) return;
    observer.disconnect();
    document.fonts?.ready.then(run);
  });
  observer.observe(svg);
}

/* SVG text cannot receive a CSS background. Size an opaque theme-painted
   plate in the text's own coordinate space, preserving the author's ink. */
function addTextBackplates(svg, selector) {
  // Read every label before any insertion/attribute write to avoid one
  // forced SVG layout per label in a long sequence diagram.
  const measured = [...svg.querySelectorAll(selector)].flatMap(label => {
    try {
      const box = label.getBBox();
      return box.width && box.height ? [{ label, box }] : [];
    } catch (_) { return []; }
  });
  for (const { label, box } of measured) {
    let plate = label.previousElementSibling;
    if (!plate?.classList.contains("ibm-text-backplate")) {
      plate = document.createElementNS(SVG_NS, "rect");
      plate.setAttribute("class", "ibm-text-backplate");
      label.before(plate);
    }
    const pad = 3;
    for (const [key, value] of Object.entries({ x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2, rx: 3 })) plate.setAttribute(key, String(value));
    const transform = label.getAttribute("transform");
    if (transform) plate.setAttribute("transform", transform);
    else plate.removeAttribute("transform");
  }
}

function compactC4Title(svg) {
  const titles = [...svg.querySelectorAll(":scope > text")];
  if (titles.length !== 1) return;
  const title = titles[0], matrix = svg.getCTM();
  if (!matrix) return;
  const tops = [...svg.children].filter(e => e.tagName.toLowerCase() === "g").flatMap(group => {
    const box = group.getBBox(), transform = group.getCTM();
    if (!box.width || !box.height || !transform) return [];
    const relative = matrix.inverse().multiply(transform);
    return [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(relative).y);
  });
  if (!tops.length) return;
  const box = title.getBBox(), gap = Math.min(...tops) - (box.y + box.height);
  if (gap <= 32) return;
  if (!title.hasAttribute("data-ibm-c4-title-y")) title.setAttribute("data-ibm-c4-title-y", title.getAttribute("y") || "0");
  title.setAttribute("y", String(Number(title.getAttribute("y")) + gap - 24));
  svg.dispatchEvent(new Event("ibm-geometry-change"));
}

function separateC4Labels(svg) {
  const rootMatrix = svg.getCTM();
  if (!rootMatrix) return;
  const boxInSvg = element => {
    const matrix = element.getCTM();
    if (!matrix) return null;
    const box = element.getBBox();
    const relative = rootMatrix.inverse().multiply(matrix);
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(relative));
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
  };
  const obstacles = [...svg.querySelectorAll("g.node")].map(boxInSvg).filter(Boolean);
  const bounds = svg.viewBox.baseVal;
  for (const label of svg.querySelectorAll('g > text[fill="#444444"]')) {
    // Relationship labels follow their line/path. Boundaries and explicit
    // UpdateRelStyle text colors stay where the author placed them.
    if (label.closest("g.node") || !label.previousElementSibling?.matches("line, path")) continue;
    if (label.hasAttribute("data-ibm-c4-label-position")) {
      const [x, y] = label.getAttribute("data-ibm-c4-label-position").split("|");
      label.setAttribute("x", x); label.setAttribute("y", y);
    }
    const box = boxInSvg(label);
    if (!box?.width) continue;
    const { dx, dy } = avoidC4LabelNodes(box, obstacles, bounds);
    if (!dx && !dy) continue;
    if (!label.hasAttribute("data-ibm-c4-label-position")) label.setAttribute("data-ibm-c4-label-position", `${label.getAttribute("x")}|${label.getAttribute("y")}`);
    const matrix = rootMatrix.inverse().multiply(label.getCTM());
    const local = matrix.inverse();
    const origin = new DOMPoint(0, 0).matrixTransform(local), delta = new DOMPoint(dx, dy).matrixTransform(local);
    label.setAttribute("x", String(Number(label.getAttribute("x")) + delta.x - origin.x));
    label.setAttribute("y", String(Number(label.getAttribute("y")) + delta.y - origin.y));
  }
}

/* Venn (beta) sizes its viewBox from the circles only, so a title wider
   than the circles is clipped on the left. Grow the viewBox to include it. */
function fitVennTitle(svg) {
  if (svg.hasAttribute("data-ibm-venn-title-fixed")) return;
  const title = svg.querySelector("text.venn-title");
  const areas = [...svg.querySelectorAll("g.venn-area")];
  if (!areas.length) return;
  const union = boxes => boxes.reduce((u, b) => u ? {
    x: Math.min(u.x, b.x), y: Math.min(u.y, b.y),
    r: Math.max(u.r, b.x + b.width), b: Math.max(u.b, b.y + b.height)
  } : { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height }, null);
  let content;
  try { content = union(areas.map(area => area.getBBox()).filter(box => box.width)); } catch (_) { return; }
  if (!content) return;
  // Center the title over the circles instead of Mermaid's page center.
  if (title) {
    title.setAttribute("x", (content.x + content.r) / 2);
    title.setAttribute("text-anchor", "middle");
    try {
      const box = title.getBBox();
      if (box.width) content = union([{ x: content.x, y: content.y, width: content.r - content.x, height: content.b - content.y }, box]);
    } catch (_) { /* keep circles only */ }
  }
  const pad = 16;
  svg.setAttribute("viewBox", `${content.x - pad} ${content.y - pad} ${content.r - content.x + pad * 2} ${content.b - content.y + pad * 2}`);
  svg.setAttribute("data-ibm-venn-title-fixed", "");
  svg.dispatchEvent(new CustomEvent("ibm-geometry-change"));
}

function separateVennLabels(svg) {
  const labels = [...svg.querySelectorAll("text.label")];
  let boxes;
  try { boxes = labels.map(label => ({ label, box: label.getBBox(), dx: 0, dy: 0 })); } catch (_) { return; }
  if (boxes.some(entry => !entry.box.width)) return;
  const overlaps = (a, b) => a.box.x + a.dx < b.box.x + b.dx + b.box.width && b.box.x + b.dx < a.box.x + a.dx + a.box.width &&
    a.box.y + a.dy < b.box.y + b.dy + b.box.height && b.box.y + b.dy < a.box.y + a.dy + a.box.height;
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i], b = boxes[j];
        if (!overlaps(a, b)) continue;
        // Labels on one row (intersections side by side) part sideways;
        // stacked ones part vertically.
        if (Math.abs((a.box.y + a.dy) - (b.box.y + b.dy)) < Math.min(a.box.height, b.box.height) / 2) {
          const left = a.box.x + a.dx <= b.box.x + b.dx ? a : b;
          const right = left === a ? b : a;
          const push = (left.box.x + left.dx + left.box.width) - (right.box.x + right.dx) + 8;
          left.dx -= push / 2;
          right.dx += push / 2;
          moved = true;
          continue;
        }
        const upper = a.box.y + a.dy <= b.box.y + b.dy ? a : b;
        const lower = upper === a ? b : a;
        const push = (upper.box.y + upper.dy + upper.box.height) - (lower.box.y + lower.dy) + 4;
        upper.dy -= push / 2;
        lower.dy += push / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const entry of boxes) {
    if (entry.dx) {
      entry.label.setAttribute("x", Number(entry.label.getAttribute("x")) + entry.dx);
      for (const span of entry.label.querySelectorAll("tspan[x]")) span.setAttribute("x", Number(span.getAttribute("x")) + entry.dx);
    }
    if (!entry.dy) continue;
    const y = Number(entry.label.getAttribute("y")) + entry.dy;
    entry.label.setAttribute("y", y);
    for (const span of entry.label.querySelectorAll("tspan[y]")) span.setAttribute("y", Number(span.getAttribute("y")) + entry.dy);
  }
}

/* Mermaid keeps each Sankey label at its node centre, even when labels in
   neighbouring columns share that row. Keep every label near its node and
   choose the smallest vertical displacement that clears earlier labels. */
function separateSankeyLabels(svg) {
  const labels = [...svg.querySelectorAll("g.node-labels text[y]")];
  if (labels.length < 2) return;
  const view = svg.viewBox.baseVal;
  const entries = [];
  try {
    for (const label of labels) {
      const originalY = label.dataset.ibmSankeyY || label.getAttribute("y");
      label.setAttribute("y", originalY);
      label.dataset.ibmSankeyY = originalY;
      const box = label.getBBox();
      if (!box.width || !box.height) return;
      entries.push({ label, originalY: Number(originalY), box, dy: 0 });
    }
  } catch (_) { return; }
  entries.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const placed = [];
  const gap = 3;
  const overlaps = (a, dy, b) =>
    a.box.x < b.box.x + b.box.width + gap && b.box.x < a.box.x + a.box.width + gap &&
    a.box.y + dy < b.box.y + b.dy + b.box.height + gap &&
    b.box.y + b.dy < a.box.y + dy + a.box.height + gap;
  for (const entry of entries) {
    for (let distance = 0; distance <= 80; distance += 2) {
      const candidates = distance ? [-distance, distance] : [0];
      const found = candidates.find(dy =>
        entry.box.y + dy >= view.y && entry.box.y + dy + entry.box.height <= view.y + view.height &&
        placed.every(other => !overlaps(entry, dy, other)));
      if (found === undefined) continue;
      entry.dy = found;
      break;
    }
    if (entry.dy) entry.label.setAttribute("y", entry.originalY + entry.dy);
    placed.push(entry);
  }
}

/* Journey: Mermaid encodes each task's score by how low its face hangs
   (cy = 300 + (5 - score) * 30). Read the score back, tag the mood for the
   theme, and line all faces up in one row under the axis, as a mood strip.
   The dashed task lines are shortened to meet the row. */
function arrangeJourneyFaces(svg) {
  if (svg.hasAttribute("data-ibm-journey-fixed")) return;
  svg.setAttribute("data-ibm-journey-fixed", "");
  const axis = [...svg.querySelectorAll("line[marker-end]")][0];
  const axisY = axis ? Number(axis.getAttribute("y1")) : 200;
  const rowY = axisY + 62;
  for (const face of svg.querySelectorAll("circle.face")) {
    const group = face.parentElement;
    const cy = Number(face.getAttribute("cy"));
    const score = Math.max(1, Math.min(5, Math.round(5 - (cy - 300) / 30)));
    group.setAttribute("data-ibm-mood", score >= 4 ? "good" : score === 3 ? "ok" : "bad");
    const wrap = document.createElementNS(SVG_NS, "g");
    wrap.setAttribute("class", "ibm-journey-face");
    wrap.setAttribute("transform", `translate(0,${rowY - cy})`);
    face.before(wrap);
    // Only the face itself moves: the circle, the eyes group right after it,
    // and the mouth. The task card and actor dots share this group.
    const eyes = face.nextElementSibling?.tagName === "g" ? face.nextElementSibling : null;
    const mouth = group.querySelector(".mouth");
    wrap.appendChild(face);
    if (eyes) wrap.appendChild(eyes);
    if (mouth && !wrap.contains(mouth)) wrap.appendChild(mouth);
    const line = group.querySelector("line.task-line");
    if (line) line.setAttribute("y2", rowY - Number(face.getAttribute("r") || 15) - 4);
  }
}

/* Gantt: a colored dot ahead of each section title, as in a legend. */
function markGanttSections(svg) {
  if (svg.hasAttribute("data-ibm-gantt-fixed")) return;
  svg.setAttribute("data-ibm-gantt-fixed", "");
  for (const title of svg.querySelectorAll("text.sectionTitle")) {
    const x = Number(title.getAttribute("x"));
    const y = Number(title.getAttribute("y"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "ibm-gantt-dot");
    dot.setAttribute("cx", x + 6);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", 5);
    title.before(dot);
    title.setAttribute("x", x + 20);
    for (const span of title.querySelectorAll("tspan[x]")) span.setAttribute("x", Number(span.getAttribute("x")) + 20);
  }
}

/* Pie: turn it into a donut with the total in the hole, and replace the
   swatch legend with a small table: dot, category, count, ratio pill and a
   ratio bar. Values come from showData ("Label [34]"); without them the
   slice percentages are used. Everything here is plain SVG tagged with
   classes and data-ibm-series; the theme paints it. */
function buildPieTable(svg) {
  if (svg.hasAttribute("data-ibm-pie-table")) {
    // Repainting clears transient series tags; the table itself survives.
    for (const [index, row] of [...svg.querySelectorAll("g.ibm-pie-row")].entries()) {
      for (const mark of row.querySelectorAll(".ibm-pie-row-bg, .ibm-pie-dot-bg, .ibm-pie-dot, .ibm-pie-pill, .ibm-pie-pill-text, .ibm-pie-bar")) {
        mark.setAttribute("data-ibm-series", slot(index));
      }
    }
    return;
  }
  const slices = [...svg.querySelectorAll("path.pieCircle")];
  const legends = [...svg.querySelectorAll("g.legend")];
  const outer = svg.querySelector("circle.pieOuterCircle");
  const center = slices[0]?.closest("g[transform]");
  if (!slices.length || !legends.length || !outer || !center) return;
  svg.setAttribute("data-ibm-pie-table", "");
  const R = Number(outer.getAttribute("r")) || 185;
  const percents = [...svg.querySelectorAll("text.slice")].map(t => parseFloat(t.textContent) || 0);
  const rows = legends.map((legend, index) => {
    const text = (legend.querySelector("text")?.textContent || "").trim();
    const m = /^(.*?)\s*\[([\d.]+)\]\s*$/.exec(text);
    return { name: m ? m[1] : text, value: m ? Number(m[2]) : null, index };
  });
  const hasValues = rows.every(row => row.value !== null);
  const total = hasValues ? rows.reduce((sum, row) => sum + row.value, 0) : null;
  rows.forEach(row => {
    row.pct = hasValues && total ? (row.value / total) * 100 : (percents[row.index] || 0);
  });
  const el = (tag, attrs, parent, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
  };
  const series = index => slot(index);

  // Donut hole with the total.
  const hole = el("g", { class: "ibm-pie-center" }, center);
  el("circle", { class: "ibm-pie-hole", cx: 0, cy: 0, r: Math.round(R * 0.5) }, hole);
  if (total !== null) {
    el("text", { class: "ibm-pie-total", x: 0, y: -2, "text-anchor": "middle", "dominant-baseline": "middle" }, hole, String(Math.round(total * 100) / 100));
    el("text", { class: "ibm-pie-total-label", x: 0, y: 26, "text-anchor": "middle", "dominant-baseline": "middle" }, hole, t("pieTotal"));
  }

  // Table to the right of the pie.
  const rowH = 52, x0 = R + 56, width = 440;
  const tableTop = -((rows.length * rowH) + 30) / 2;
  const table = el("g", { class: "ibm-pie-table", transform: `translate(${x0},${tableTop})` }, center);
  el("text", { class: "ibm-pie-head", x: 16, y: 10 }, table, t("pieCategory"));
  if (hasValues) el("text", { class: "ibm-pie-head", x: 280, y: 10, "text-anchor": "end" }, table, t("pieCount"));
  el("text", { class: "ibm-pie-head", x: 306, y: 10 }, table, t("pieRatio"));
  const maxPct = Math.max(...rows.map(row => row.pct), 1);
  rows.forEach((row, i) => {
    const y = 26 + i * rowH;
    const g = el("g", { class: "ibm-pie-row", transform: `translate(0,${y})` }, table);
    el("rect", { class: "ibm-pie-row-bg", x: 0, y: 0, width, height: rowH - 6, rx: 12, ry: 12, "data-ibm-series": series(i) }, g);
    el("circle", { class: "ibm-pie-dot-bg", cx: 24, cy: (rowH - 6) / 2, r: 12, "data-ibm-series": series(i) }, g);
    el("circle", { class: "ibm-pie-dot", cx: 24, cy: (rowH - 6) / 2, r: 5, "data-ibm-series": series(i) }, g);
    el("text", { class: "ibm-pie-name", x: 46, y: (rowH - 6) / 2, "dominant-baseline": "middle" }, g, row.name);
    if (hasValues) el("text", { class: "ibm-pie-value", x: 280, y: (rowH - 6) / 2, "text-anchor": "end", "dominant-baseline": "middle" }, g, String(row.value));
    const label = `${Math.round(row.pct)}%`;
    el("rect", { class: "ibm-pie-pill", x: 306, y: 5, width: 52, height: 21, rx: 10.5, ry: 10.5, "data-ibm-series": series(i) }, g);
    el("text", { class: "ibm-pie-pill-text", x: 332, y: 16, "text-anchor": "middle", "dominant-baseline": "middle", "data-ibm-series": series(i) }, g, label);
    el("rect", { class: "ibm-pie-track", x: 306, y: 32, width: 116, height: 5, rx: 2.5, ry: 2.5 }, g);
    el("rect", { class: "ibm-pie-bar", x: 306, y: 32, width: Math.max(4, (row.pct / maxPct) * 116), height: 5, rx: 2.5, ry: 2.5, "data-ibm-series": series(i) }, g);
  });
}

/* Requirement diagram: Mermaid draws each box as a hand-drawn outline path,
   which cannot be rounded. Lay a card behind it with a header band (the
   stereotype and name rows), a type icon at the header's left, and bold the
   "Key:" part of each body line. Colors come from the theme. */
const FLOW_ICONS = {
  xcircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6 M15 9l-6 6",
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l2.7 2.7L16 10",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  card: "M3 6h18v12H3z M3 10h18 M7 15h4",
  edit: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  rss: "M5 5a14 14 0 0 1 14 14 M5 11a8 8 0 0 1 8 8 M6 18a1 1 0 1 0 0.01 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  headset: "M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H5a1 1 0 0 1-1-1z M20 14h-3v5h2a1 1 0 0 0 1-1z",
  server: "M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01",
  browser: "M3 5h18v14H3z M3 9h18 M6 7h.01 M9 7h.01",
  queue: "M3 5h18v14H3z M7 12h6 M13 9l3 3-3 3",
  cart: "M3 4h2l2.4 11h10.2L20 8H6.2 M9 20h.01 M17 20h.01",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  bank: "M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01"
};

const REQ_ICONS = {
  doc: "M6 2h8l5 5v15H6z M14 2v5h5 M9 13h7 M9 17h7",
  gear: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1",
  chart: "M5 20v-8 M12 20V5 M19 20v-5",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  plug: "M9 2v5 M15 2v5 M6 7h12v4a6 6 0 0 1-12 0z M12 17v5",
  box: "M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10",
  ruler: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2"
};

function requirementIcon(stereotype, body) {
  const s = stereotype.toLowerCase();
  if (s.includes("functional")) return "gear";
  if (s.includes("performance")) return "chart";
  if (s.includes("interface")) return "shield";
  if (s.includes("physical")) return "box";
  if (s.includes("design")) return "ruler";
  if (s.includes("element")) {
    const type = (/type:\s*([^\n]+)/i.exec(body)?.[1] || "").toLowerCase();
    if (/data|db|store|sql/.test(type)) return "db";
    if (/web|ui|app|front/.test(type)) return "monitor";
    if (/integration|adapter|gateway|plug/.test(type)) return "plug";
    if (/service|api|server/.test(type)) return "gear";
    return "box";
  }
  return "doc";
}

function drawRequirementCards(svg) {
  if (svg.hasAttribute("data-ibm-req-fixed")) return;
  svg.setAttribute("data-ibm-req-fixed", "");
  for (const node of svg.querySelectorAll("g.node")) {
    const shape = node.querySelector(":scope > g.basic > path");
    const labels = [...node.querySelectorAll(":scope > g.label")];
    if (!shape || labels.length < 2) continue;
    const nums = [...(shape.getAttribute("d") || "").matchAll(/-?[\d.]+/g)].map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (!Number.isFinite(x0) || x1 - x0 < 20) continue;

    const stereotype = labels[0].textContent || "";
    const body = labels.slice(2).map(label => label.textContent).join("\n");
    const bodyTop = labels[2] ? parseTranslate(labels[2]).y : parseTranslate(labels[1]).y + 26;
    const headBottom = Math.min(y1, bodyTop - 6);
    const r = 12;

    const card = document.createElementNS(SVG_NS, "rect");
    card.setAttribute("class", "ibm-req-card");
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: r, ry: r })) card.setAttribute(k, v);
    const head = document.createElementNS(SVG_NS, "path");
    head.setAttribute("class", "ibm-req-head");
    head.setAttribute("d", `M${x0},${headBottom} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${headBottom} Z`);
    node.insertBefore(head, node.firstChild);
    node.insertBefore(card, node.firstChild);
    node.setAttribute("data-ibm-req", requirementIcon(stereotype, body));

    // Icon tile at the header's left; header rows shift right beside it.
    const headMid = (y0 + headBottom) / 2;
    const tile = document.createElementNS(SVG_NS, "rect");
    tile.setAttribute("class", "ibm-req-icon-bg");
    for (const [k, v] of Object.entries({ x: x0 + 14, y: headMid - 16, width: 32, height: 32, rx: 9, ry: 9 })) tile.setAttribute(k, v);
    const icon = document.createElementNS(SVG_NS, "path");
    icon.setAttribute("class", "ibm-req-icon");
    icon.setAttribute("d", REQ_ICONS[requirementIcon(stereotype, body)]);
    icon.setAttribute("transform", `translate(${x0 + 18},${headMid - 12})`);
    node.appendChild(tile);
    node.appendChild(icon);
    for (const label of labels.slice(0, 2)) {
      const at = parseTranslate(label);
      if (at) label.setAttribute("transform", `translate(${x0 + 56},${at.y})`);
      label.classList.add(label === labels[0] ? "ibm-req-stereotype" : "ibm-req-name");
      // Mermaid sized this box for regular weight; the name is bold now.
      const fo = label.querySelector("foreignObject");
      if (fo) fo.setAttribute("width", Math.ceil(Number(fo.getAttribute("width")) * 1.3));
    }

    // Body: bold the key before the first colon.
    for (const label of labels.slice(2)) {
      label.classList.add("ibm-req-body");
      const p = label.querySelector("p, span");
      if (!p || p.querySelector("strong")) continue;
      const text = p.textContent || "";
      const at = text.indexOf(":");
      if (at <= 0 || at > 24) continue;
      const strong = document.createElement("strong");
      strong.textContent = text.slice(0, at + 1);
      p.textContent = text.slice(at + 1);
      p.insertBefore(strong, p.firstChild);
      // Bold keys are wider than Mermaid's original regular-weight measurement.
      // Convert the painted range back to SVG units before expanding its clip box.
      const fo = label.querySelector("foreignObject");
      const matrix = fo?.getScreenCTM();
      if (fo && matrix) {
        const range = document.createRange();
        range.selectNodeContents(p);
        const scale = Math.hypot(matrix.a, matrix.b);
        const width = range.getBoundingClientRect().width / scale;
        if (scale > 0 && Number.isFinite(width)) {
          fo.setAttribute("width", Math.ceil(Math.max(Number(fo.getAttribute("width")), width) + 2));
        }
      }
    }
  }
}

/* Use case: actors sit on cards with an avatar disc behind the figure, the
   system boundary gets a header band with an icon and a left-aligned title,
   and association lines start from a dot. Shapes only; the theme colors. */
function decorateUsecase(svg) {
  if (svg.hasAttribute("data-ibm-usecase-fixed")) return;
  svg.setAttribute("data-ibm-usecase-fixed", "");
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  for (const actor of svg.querySelectorAll("g.usecase-actor")) {
    const outline = actor.querySelector("rect.usecase-actor-outline");
    const glyph = actor.querySelector("g.usecase-actor-glyph");
    if (!outline || !glyph) continue;
    const x = Number(outline.getAttribute("x")), y = Number(outline.getAttribute("y"));
    const w = Number(outline.getAttribute("width")), h = Number(outline.getAttribute("height"));
    actor.insertBefore(el("rect", { class: "ibm-uc-card", x: x - 8, y: y - 10, width: w + 16, height: h + 20, rx: 14, ry: 14 }), actor.firstChild);
    const gy = (parseTranslate(glyph)?.y || 0) - 4;
    glyph.before(el("circle", { class: "ibm-uc-avatar", cx: 0, cy: gy, r: 34 }));
  }

  for (const boundary of svg.querySelectorAll("g.usecase-system-boundary")) {
    const body = boundary.querySelector("rect.boundary-body");
    const title = boundary.querySelector("g.system-boundary-title");
    if (!body) continue;
    const x = Number(body.getAttribute("x")), y = Number(body.getAttribute("y"));
    const w = Number(body.getAttribute("width"));
    const r = 16, band = 52;
    body.after(el("path", { class: "ibm-uc-band", d: `M${x},${y + band} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + band} Z` }));
    const tile = el("circle", { class: "ibm-uc-icon-bg", cx: x + 34, cy: y + band / 2, r: 17 });
    const icon = el("path", { class: "ibm-uc-icon", d: REQ_ICONS.box, transform: `translate(${x + 25},${y + band / 2 - 9}) scale(0.75)` });
    boundary.appendChild(tile);
    boundary.appendChild(icon);
    if (title) title.setAttribute("transform", `translate(${x + 62},${y + band / 2 - 12})`);
  }

  // Associations leave the actor from the card's edge (the card is 8px wider
  // than Mermaid's actor box), marked with a dot.
  for (const edge of svg.querySelectorAll("path.relationship-association")) {
    const d = edge.getAttribute("d") || "";
    const m = /^\s*M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*[LQC]\s*(-?[\d.]+)/.exec(d);
    if (!m) continue;
    const x = Number(m[1]), y = Number(m[2]), nextX = Number(m[3]);
    const sx = x + Math.sign(nextX - x || 1) * 8;
    edge.setAttribute("d", d.replace(/^\s*M\s*-?[\d.]+/, `M${sx}`));
    edge.after(el("circle", { class: "ibm-uc-dot", cx: sx, cy: y, r: 3.5 }));
  }
}

/* Flowchart: white cards with a semantic icon, solid pill terminals, white
   diamonds with the icon above the text, and cluster titles moved to the
   left beside an icon tile. Shapes come from the source (see
   installFlowchartShapes); icons from keywords in the label, and a node whose
   text matches nothing simply gets no icon. */
// Order matters: the first match wins, so specific intents come before the
// generic words they contain (风控通过 is a check, not a success).
const FLOW_KEYWORDS = [
  [/取消|拒绝|失败|驳回|cancel|reject|fail|error|deny/i, "xcircle", "danger"],
  [/等待|重试|超时|延迟|wait|retry|timeout|delay/i, "clock", "warn"],
  [/风控|校验|审核|安全|risk|verify|check|security|auth/i, "shield", "accent"],
  [/创建|新建|create|new/i, "doc", "accent"],
  [/支付|付款|pay|payment|charge|billing/i, "card", "accent"],
  [/确认|完成|成功|通过|confirm|done|success|approve|complete/i, "check", "success"],
  [/补充|编辑|修改|填写|edit|update|fill/i, "edit", "accent"],
  [/库存|包裹|商品|stock|inventory|package|item/i, "box", "accent"],
  [/发布|事件|通知|消息|publish|event|notify|message/i, "rss", "accent"],
  [/配送|订单|单据|信息|order|ship|delivery|info/i, "doc", "accent"]
];
const CLUSTER_KEYWORDS = [
  [/用户|客户|会员|user|customer|client/i, "user"],
  [/服务|订单|业务|service|order|api|backend/i, "gear"],
  [/数据|履约|分析|报表|data|analytics|report|fulfil/i, "chart"]
];

function flowIcon(text) {
  for (const [re, icon, tone] of FLOW_KEYWORDS) if (re.test(text)) return { icon, tone };
  return null;
}

function decorateFlowchart(svg) {
  if (svg.hasAttribute("data-ibm-flow-fixed")) return;
  svg.setAttribute("data-ibm-flow-fixed", "");
  let shapes = {};
  try { shapes = JSON.parse(svg.getAttribute("data-ibm-shapes") || "{}"); } catch (_) {}
  const iconPath = name => FLOW_ICONS[name] || REQ_ICONS[name];
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  for (const node of svg.querySelectorAll("g.node")) {
    const id = /(?:^|-)flowchart-(.+)-\d+$/.exec(node.id || "")?.[1];
    const shape = (id && shapes[id]) || (node.querySelector(":scope > polygon") ? "diamond" : node.querySelector(":scope > rect.label-container") ? "rect" : "other");
    node.setAttribute("data-ibm-shape", shape);
    if (shape !== "rect" && shape !== "diamond") continue;
    const label = node.querySelector(":scope > g.label");
    const match = flowIcon(label?.textContent || "");
    if (!label || !match) continue;
    const at = parseTranslate(label);
    const icon = el("path", { class: `ibm-flow-icon tone-${match.tone}`, d: iconPath(match.icon) });
    if (shape === "rect") {
      const rect = node.querySelector(":scope > rect.label-container");
      const x0 = Number(rect.getAttribute("x"));
      icon.setAttribute("transform", `translate(${x0 + 12},-8) scale(0.667)`);
      label.setAttribute("transform", `translate(${at.x + 11},${at.y})`);
    } else {
      icon.setAttribute("transform", "translate(-9,-24) scale(0.75)");
      label.setAttribute("transform", `translate(${at.x},${at.y + 10})`);
    }
    node.appendChild(icon);
  }

  for (const cluster of svg.querySelectorAll("g.cluster:not(.swimlane)")) {
    const rect = cluster.querySelector(":scope > rect");
    const label = cluster.querySelector(":scope > g.cluster-label");
    if (!rect || !label) continue;
    const x = Number(rect.getAttribute("x")), y = Number(rect.getAttribute("y"));
    const name = label.textContent || "";
    const icon = (CLUSTER_KEYWORDS.find(([re]) => re.test(name)) || [null, "layers"])[1];
    cluster.appendChild(el("rect", { class: "ibm-flow-cluster-tile", x: x + 12, y: y + 8, width: 26, height: 26, rx: 8, ry: 8 }));
    cluster.appendChild(el("path", { class: "ibm-flow-cluster-icon", d: iconPath(icon), transform: `translate(${x + 17},${y + 13}) scale(0.667)` }));
    label.setAttribute("transform", `translate(${x + 46},${y + 9})`);
  }
}

/* Swimlanes: each lane gets a slot (the theme tints it), a wider title
   column with an icon and a horizontal label, and every node records the
   lane it sits in so its border and icon can take the lane's hue. */
const LANE_KEYWORDS = [
  [/用户|客户|会员|user|customer|client/i, "user"],
  [/客服|支持|运营|support|service desk|agent|ops/i, "headset"],
  [/系统|平台|服务|system|platform|service|backend/i, "db"],
  [/财务|支付|结算|finance|payment|billing/i, "card"]
];

function decorateSwimlanes(svg) {
  if (svg.hasAttribute("data-ibm-lanes-fixed")) return;
  svg.setAttribute("data-ibm-lanes-fixed", "");
  // Slots follow the lanes as drawn, top to bottom (or left to right), not
  // their DOM order.
  const laneY = lane => Number(lane.querySelector("rect.swimlane-title")?.getAttribute("y")) || 0;
  const laneX = lane => Number(lane.querySelector("rect.swimlane-title")?.getAttribute("x")) || 0;
  const lanes = [...svg.querySelectorAll("g.cluster.swimlane")].sort((a, b) => laneY(a) - laneY(b) || laneX(a) - laneX(b));
  const boxes = [];
  lanes.forEach((lane, index) => {
    const slotName = String((index % 4) + 1);
    lane.setAttribute("data-ibm-lane", slotName);
    const body = lane.querySelector("rect.swimlane-body");
    const title = lane.querySelector("rect.swimlane-title");
    const label = lane.querySelector("g.swimlane-label");
    if (!body || !title) return;
    const y = Number(title.getAttribute("y")), h = Number(title.getAttribute("height"));
    const right = Number(title.getAttribute("x")) + Number(title.getAttribute("width"));
    const width = 72, x = right - width, cx = x + width / 2, mid = y + h / 2;
    title.setAttribute("x", x);
    title.setAttribute("width", width);
    const name = label?.textContent || "";
    const icon = (LANE_KEYWORDS.find(([re]) => re.test(name)) || [null, "layers"])[1];
    const glyph = document.createElementNS(SVG_NS, "path");
    glyph.setAttribute("class", "ibm-lane-icon");
    glyph.setAttribute("d", FLOW_ICONS[icon] || REQ_ICONS[icon]);
    // Icon (28px) and name stacked, centred on the title column.
    glyph.setAttribute("transform", `translate(${cx - 14},${mid - 34}) scale(1.167)`);
    lane.appendChild(glyph);
    if (label) {
      label.setAttribute("transform", `translate(${x + 4},${mid + 2})`);
      const fo = label.querySelector("foreignObject");
      if (fo) {
        fo.setAttribute("width", width - 8);
        fo.setAttribute("height", 44);
      }
    }
    boxes.push({ slot: slotName, x0: Number(body.getAttribute("x")), y0: y, x1: Number(body.getAttribute("x")) + Number(body.getAttribute("width")), y1: y + h });
  });
  for (const node of svg.querySelectorAll("g.node")) {
    const at = parseTranslate(node);
    if (!at) continue;
    const lane = boxes.find(b => at.x >= b.x0 && at.x <= b.x1 && at.y >= b.y0 && at.y <= b.y1);
    if (lane) node.setAttribute("data-ibm-lane", lane.slot);
  }
}

/* Sequence: participant cards get a type icon (people keep Mermaid's figure),
   each alt/loop/par frame gets a rounded tinted panel, and the pentagon
   label is replaced by a pill tagged with the frame type. */
const PARTICIPANT_KEYWORDS = [
  [/web|app|前端|浏览器|browser|client|ui/i, "browser"],
  [/gateway|网关|proxy|nginx|lb/i, "server"],
  [/inventory|库存|database|db|数据库|store|cache|redis|mysql|postgres/i, "db"],
  [/pay|支付|billing|stripe/i, "card"],
  [/queue|mq|消息|kafka|rabbit|event|bus/i, "queue"],
  [/service|服务|api|backend|server/i, "gear"]
];
const FRAME_TYPES = ["alt", "opt", "loop", "par", "critical", "break", "rect"];

function decorateSequence(svg) {
  // Measure every label before changing the SVG. Reading after inserting
  // each preceding pill forces a full document layout per sequence frame.
  const labelWidths = new Map();
  if (!svg.hasAttribute("data-ibm-seq-fixed")) {
    for (const box of svg.querySelectorAll("polygon.labelBox")) {
      const label = box.parentElement.querySelector(":scope > text.labelText");
      labelWidths.set(box, label?.getComputedTextLength?.() || 24);
    }
  }
  for (const region of svg.querySelectorAll("rect.rect[fill]")) {
    region.style.setProperty("--ibm-seq-region-color", region.getAttribute("fill"));
  }
  if (svg.hasAttribute("data-ibm-seq-fixed")) return;
  svg.setAttribute("data-ibm-seq-fixed", "");
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  for (const rect of svg.querySelectorAll("rect.actor")) {
    const group = rect.parentElement;
    const text = group.querySelector("text.actor");
    if (!text) continue;
    const match = PARTICIPANT_KEYWORDS.find(([re]) => re.test(text.textContent || ""));
    if (!match) continue;
    const x = Number(rect.getAttribute("x")), y = Number(rect.getAttribute("y"));
    const h = Number(rect.getAttribute("height"));
    group.appendChild(el("path", { class: "ibm-seq-icon", d: FLOW_ICONS[match[1]] || REQ_ICONS[match[1]], transform: `translate(${x + 14},${y + h / 2 - 12})` }));
    // Text starts right of the icon instead of staying centred over it.
    group.setAttribute("data-ibm-seq-iconed", "");
    text.style.setProperty("text-anchor", "start");
    for (const node of [text, ...text.querySelectorAll("tspan[x]")]) {
      if (node.hasAttribute("x")) node.setAttribute("x", x + 46);
      node.setAttribute("text-anchor", "start");
    }
  }

  for (const box of svg.querySelectorAll("polygon.labelBox")) {
    const group = box.parentElement;
    const lines = [...group.querySelectorAll(":scope > line.loopLine")];
    const label = group.querySelector(":scope > text.labelText");
    const type = (label?.textContent || "").trim().toLowerCase();
    group.setAttribute("data-ibm-frame", FRAME_TYPES.includes(type) ? type : "other");
    if (lines.length >= 4) {
      const xs = lines.flatMap(l => [Number(l.getAttribute("x1")), Number(l.getAttribute("x2"))]);
      const ys = lines.flatMap(l => [Number(l.getAttribute("y1")), Number(l.getAttribute("y2"))]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      group.insertBefore(el("rect", { class: "ibm-seq-frame", x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 10, ry: 10 }), group.firstChild);
      lines.slice(0, 4).forEach(line => line.classList.add("ibm-seq-frame-edge"));
    }
    const pts = (box.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    const px = pts.filter((_, i) => i % 2 === 0), py = pts.filter((_, i) => i % 2 === 1);
    const bx = Math.min(...px), by = Math.min(...py);
    const pill = el("rect", { class: "ibm-seq-pill", x: bx + 6, y: by + 5, width: Math.max(38, (labelWidths.get(box) || 24) + 20), height: 20, rx: 10, ry: 10 });
    box.after(pill);
    if (label) {
      label.setAttribute("x", Number(pill.getAttribute("x")) + Number(pill.getAttribute("width")) / 2);
      label.setAttribute("y", by + 15);
      label.setAttribute("dominant-baseline", "middle");
      pill.after(label);
    }
  }
}

function tagGroups(svg) {
  const clusters = [...svg.querySelectorAll(CLUSTER_GROUPS)].map(cluster => {
    const shape = cluster.querySelector(":scope > rect, :scope > polygon, :scope > path") || cluster;
    const box = shape.getBoundingClientRect();
    const index = [...cluster.parentElement.children].indexOf(cluster);
    return { box, index, area: box.width * box.height };
  }).filter(entry => entry.area > 0);
  if (!clusters.length) return;

  const nodes = [...svg.querySelectorAll("g.node")].map(node => ({ node, box: node.getBoundingClientRect() }));
  for (const { node, box } of nodes) {
    if (!box.width) continue;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    let best = null;
    for (const cluster of clusters) {
      const b = cluster.box;
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
      if (!best || cluster.area < best.area) best = cluster;
    }
    if (best) node.setAttribute("data-ibm-group", slot(best.index));
  }
}

/* Treemap leaves carry no class naming their section; take the series of the
   innermost section that contains them so a tile matches its group. */
function tagTreemapLeaves(svg) {
  const sections = [...svg.querySelectorAll("rect.treemapSection")]
    .filter(rect => rect.style.display !== "none")
    .map(rect => ({ rect, box: rect.getBoundingClientRect(), n: Number(/section(\d+)/.exec(rect.getAttribute("class") || "")?.[1] || 0) }))
    .filter(entry => entry.box.width > 0);
  const leaves = [...svg.querySelectorAll("rect.treemapLeaf")].map(leaf => ({ leaf, box: leaf.getBoundingClientRect() }));
  for (const section of sections) section.rect.setAttribute("data-ibm-series", slot(Math.max(0, section.n - 1)));
  for (const { leaf, box: b } of leaves) {
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    let best = null;
    for (const s of sections) {
      if (x < s.box.left || x > s.box.right || y < s.box.top || y > s.box.bottom) continue;
      if (!best || s.box.width * s.box.height < best.box.width * best.box.height) best = s;
    }
    if (best) leaf.setAttribute("data-ibm-series", slot(Math.max(0, best.n - 1)));
  }
}

function tagSeries(svg) {
  const swatches = [...svg.querySelectorAll(SERIES_SWATCHES)];
  const marks = [...svg.querySelectorAll(SERIES_MARKS)];
  // Snapshot all label geometry before assigning color attributes. Otherwise
  // each mark invalidates style/layout before the next mark's measurements.
  const bounds = new Map(), groups = new Map();
  const labels = new Set();
  for (const element of marks) {
    if (!isTextElement(element) && element.getAttribute("fill") !== "none") {
      for (const label of labelsOverMark(element, bounds, groups)) labels.add(label);
    }
  }
  swatches.forEach((element, index) => element.setAttribute("data-ibm-series", slot(index)));
  marks.forEach((element, index) => {
    element.setAttribute("data-ibm-series", slot(seriesIndex(element, index)));
    if (!isTextElement(element) && element.getAttribute("fill") === "none") element.setAttribute("data-ibm-stroked", "");
  });
  for (const label of labels) label.setAttribute("data-ibm-on-mark", "");
}

/* A label printed on a series mark has to read on that mark — but only if it
   is actually printed on it; a pie legend's text sits on the page. */
function labelsOverMark(mark, cache = new Map(), groups = new Map()) {
  const group = mark.closest("g");
  if (!group) return [];
  const boundsOf = element => {
    if (!cache.has(element)) cache.set(element, element.getBoundingClientRect());
    return cache.get(element);
  };
  const bounds = boundsOf(mark);
  if (!bounds.width || !bounds.height) return [];
  if (!groups.has(group)) groups.set(group, [...group.querySelectorAll("text, tspan, foreignObject div, foreignObject span, foreignObject p")]);
  return groups.get(group).filter(element => {
    const rect = boundsOf(element);
    if (!rect.width || !rect.height) return false;
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  });
}

function markLabelsOver(mark) {
  for (const label of labelsOverMark(mark)) label.setAttribute("data-ibm-on-mark", "");
}

/* Class boxes are one outline path plus divider paths, so they cannot take
   rx. Lay a rounded card and a header band (down to the first divider)
   behind each; the theme paints them and hides the square outline. */
// First match wins: specific intents before the generic words they contain
// (PaymentProvider is a provider, StripeAdapter a card, BankAdapter a bank).
const CLASS_ICONS = [
  [/item|line|product|商品|明细/i, "box"],
  [/status|state|enum|type|kind|状态|类型/i, "list"],
  [/user|customer|client|member|account|用户|客户|会员/i, "user"],
  [/order|cart|basket|订单|购物/i, "cart"],
  [/bank|银行/i, "bank"],
  [/stripe|card|wallet/i, "card"],
  [/provider|gateway|interface|connector|接口|网关/i, "plug"],
  [/pay|billing|支付/i, "card"],
  [/service|manager|controller|handler|服务/i, "gear"],
  [/repo|store|dao|db|database|仓库|存储/i, "db"],
  [/adapter|client/i, "plug"]
];

/* Class notes: Mermaid pins them yellow with inline !important; strip that
   default and lay a card plus an info glyph behind the text. */
function drawClassNotes(svg) {
  for (const note of svg.querySelectorAll("g.node[id^='note'], g.node[id*='-note'], g.node.note")) {
    if (note.hasAttribute("data-ibm-note")) continue;
    const shapes = [...note.querySelectorAll(":scope > g.basic > path, :scope > rect, :scope > path")];
    const outline = shapes[0];
    if (!outline) continue;
    for (const shape of shapes) {
      stashStyle(shape);
      shape.style.removeProperty("fill");
      shape.style.removeProperty("stroke");
    }
    const box = outline.getBBox();
    if (!box.width) continue;
    note.setAttribute("data-ibm-note", "");
    const card = document.createElementNS(SVG_NS, "rect");
    card.setAttribute("class", "ibm-note-card");
    for (const [k, v] of Object.entries({ x: box.x, y: box.y, width: box.width + 28, height: box.height, rx: 10, ry: 10 })) card.setAttribute(k, v);
    note.insertBefore(card, note.firstChild);
    const icon = document.createElementNS(SVG_NS, "path");
    icon.setAttribute("class", "ibm-note-icon");
    icon.setAttribute("d", FLOW_ICONS.info);
    icon.setAttribute("transform", `translate(${box.x + 10},${box.y + box.height / 2 - 9}) scale(0.75)`);
    note.appendChild(icon);
    const label = note.querySelector(":scope > g.label");
    const at = label && parseTranslate(label);
    if (at && !label.hasAttribute("data-ibm-note-label-transform")) {
      label.setAttribute("data-ibm-note-label-transform", label.getAttribute("transform") || "");
      label.setAttribute("transform", `translate(${at.x + 28},${at.y})`);
    }
  }
}

function drawClassCards(svg) {
  drawClassNotes(svg);
  for (const node of svg.querySelectorAll("g.node")) {
    if (!node.querySelector(".members-group, .methods-group")) continue;
    if (node.querySelector(".members-group")) node.setAttribute("data-ibm-members", "");
    const outline = node.querySelector(":scope > path, :scope > g > path, :scope > rect");
    if (!outline) continue;
    const box = outline.getBBox();
    if (!box.width || !box.height) continue;
    const r = Math.min(12, box.height / 2);

    const card = document.createElementNS(SVG_NS, "rect");
    card.setAttribute("class", "ibm-class-card");
    for (const [k, v] of Object.entries({ x: box.x, y: box.y, width: box.width, height: box.height, rx: r, ry: r })) card.setAttribute(k, v);

    const divider = node.querySelector(".divider");
    const headBottom = divider ? divider.getBBox().y : box.y + Math.min(box.height, 34);
    const x0 = box.x, x1 = box.x + box.width, y0 = box.y, y1 = Math.max(y0, headBottom);
    const head = document.createElementNS(SVG_NS, "path");
    head.setAttribute("class", "ibm-class-head");
    head.setAttribute("d", `M${x0},${y1} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1} Z`);

    node.insertBefore(head, node.firstChild);
    node.insertBefore(card, node.firstChild);
    node.setAttribute("data-ibm-carded", "");

    // Kind from the stereotype; icon from the kind or the class name.
    const annotation = (node.querySelector(".annotation-group")?.textContent || "").toLowerCase();
    const kind = /interface/.test(annotation) ? "interface" : /enum/.test(annotation) ? "enumeration" : /abstract/.test(annotation) ? "abstract" : "class";
    node.setAttribute("data-ibm-class-kind", kind);
    const name = node.querySelector(".label-group")?.textContent || "";
    const iconName = (CLASS_ICONS.find(([re]) => re.test(name)) || [null, kind === "interface" ? "plug" : kind === "enumeration" ? "list" : "box"])[1];
    const headMid = (y0 + y1) / 2;
    const icon = document.createElementNS(SVG_NS, "path");
    icon.setAttribute("class", "ibm-class-icon");
    icon.setAttribute("d", FLOW_ICONS[iconName] || REQ_ICONS[iconName]);
    icon.setAttribute("transform", `translate(${x0 + 14},${headMid - 10}) scale(0.84)`);
    node.appendChild(icon);
    // Name (and stereotype) left-aligned beside the icon.
    for (const group of node.querySelectorAll(":scope > .label-group, :scope > .annotation-group")) {
      const at = parseTranslate(group);
      if (!at) continue;
      group.setAttribute("transform", `translate(${x0 + 44},${at.y})`);
      const fo = group.querySelector("foreignObject");
      if (fo && !fo.hasAttribute("data-ibm-widened")) {
        fo.setAttribute("data-ibm-widened", "");
        fo.setAttribute("width", Math.ceil(Number(fo.getAttribute("width")) * 1.25));
      }
    }
  }
}

/* --------------------------------------------------------------------------
 * Dark-mode tone mapping (families the theme does not restyle)
 *
 * Mermaid ships a light palette for every family, and new families arrive
 * faster than any selector list can track. Hue and saturation are kept,
 * lightness is inverted into the theme's range. Needs computed colors, so it
 * cannot be CSS. Targets come from the theme's --ib-mm-* tokens.
 * -------------------------------------------------------------------------- */

function themeTokens() {
  const css = getComputedStyle(document.body);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const canvas = read("--ib-mm-canvas", "#0F172A");
  return {
    text: read("--ib-mm-text", "#F9FAFB"),
    canvas: parseColor(canvas) || hexToRgb(canvas) || { r: 15, g: 23, b: 42, a: 1 },
    clusterFill: read("--ib-mm-cluster-fill", "#111827")
  };
}

const TEXT_TAGS = new Set(["text", "tspan"]);

function isTextElement(element) {
  return TEXT_TAGS.has(element.tagName.toLowerCase());
}

function hexToRgb(value) {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((value || "").trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, c => c + c) : match[1];
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
}

function parseColor(value) {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(value || "");
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha === 0) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / delta + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / delta + 2) / 6;
  else h = ((rr - gg) / delta + 4) / 6;
  return { h, s, l };
}

function hslToCss({ h, s, l }, alpha = 1) {
  const css = `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return alpha < 1 ? `${css} / ${alpha})` : `${css})`;
}

function relativeLuminance({ r, g, b }) {
  const channel = value => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a) + 0.05;
  const second = relativeLuminance(b) + 0.05;
  return first > second ? first / second : second / first;
}

function toneMapForDark(svg, tokens) {
  for (const element of svg.querySelectorAll("*")) {
    // Author styling (classDef/style) is written with !important; leave it.
    if (/!important/.test(element.getAttribute("style") || "")) continue;
    const computed = window.getComputedStyle(element);
    const props = {};

    const fill = parseColor(computed.fill);
    if (fill) {
      const hsl = rgbToHsl(fill);
      if (isTextElement(element)) {
        if (contrastRatio(fill, tokens.canvas) < 4) props.fill = tokens.text;
      } else if (hsl.l > 0.6) {
        props.fill = hslToCss({ h: hsl.h, s: Math.min(hsl.s, 0.42), l: 0.13 + (1 - hsl.l) * 0.26 }, fill.a);
      } else if (hsl.l < 0.12) {
        props.fill = tokens.clusterFill;
      }
    }

    const stroke = parseColor(computed.stroke);
    if (stroke && !isTextElement(element)) {
      const hsl = rgbToHsl(stroke);
      if (hsl.l < 0.35) props.stroke = hslToCss({ h: hsl.h, s: Math.min(hsl.s, 0.5), l: 0.48 }, stroke.a);
    }

    const color = parseColor(computed.color);
    if (color && element.closest("foreignObject") && contrastRatio(color, tokens.canvas) < 4) {
      props.color = tokens.text;
    }

    if (Object.keys(props).length) applyPaint(element, props);
  }
}


/* --------------------------------------------------------------------------
 * Measuring what a Mermaid SVG actually draws
 *
 * Mermaid's own viewBox is padded differently per diagram family, and its
 * outer <g> is unreliable: Gantt's is empty (0x0), a state diagram's is twice
 * the real height, a sequence diagram's is a small inner group. getBBox() also
 * reports coordinates in each element's own user space, so unioning raw boxes
 * across transformed groups is meaningless.
 *
 * So: union the rendered leaves in screen space, then map that rectangle back
 * through the root's CTM. Defs, markers and clip paths are skipped because they
 * are templates, not drawings.
 * -------------------------------------------------------------------------- */

const NON_RENDERED = "defs, marker, clipPath, mask, pattern, symbol";
// No tspan: its <text> is measured and already spans it.
const MEASURABLE = "path, rect, circle, ellipse, polygon, polyline, line, text, image, foreignObject, use";

function measureRenderedContent(svg) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inverse = ctm.inverse();

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const element of svg.querySelectorAll(MEASURABLE)) {
    if (element.closest(NON_RENDERED)) continue;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
    const rect = element.getBoundingClientRect();
    // A straight <line> has a zero-width or zero-height box but still draws;
    // skipping it clipped journey task lines and timeline axes.
    if (rect.width <= 0 && rect.height <= 0) continue;
    // Gantt's "today" marker is drawn at today's date even when that is far
    // outside the schedule; it must not stretch the diagram.
    if (element.classList?.contains("today")) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!Number.isFinite(left) || right <= left || bottom <= top) return null;

  const topLeft = toUserSpace(svg, inverse, left, top);
  const bottomRight = toUserSpace(svg, inverse, right, bottom);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y
  };
}


/* Where the drawing actually sits inside the SVG's own box, at scale 1.
   After tightenViewBox the viewBox is exactly the content, so this is pure
   geometry: the box, the viewBox and preserveAspectRatio decide it. Obsidian
   hands back SVGs whose box does not match the viewBox's aspect, and the
   drawing then sits shrunk and centred inside a larger box — the empty bands.
   (An earlier version scanned painted elements instead; it disagreed with the
   viewBox measurement and pushed a Gantt chart ~1000px sideways.) */
function measureDrawnSize(svg) {
  const scale = Number(/scale\(([\d.]+)\)/.exec(svg.style.transform)?.[1]) || 1;
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  // Ground truth: where ink actually landed on screen. Inferring it from the
  // viewBox and preserveAspectRatio was off by ~1/3 inside Obsidian, which
  // is what left wide empty bands around every diagram.
  const ink = inkClientRect(svg);
  if (!ink) return measureDrawnSizeFromViewBox(svg, box, scale);
  return {
    width: ink.width / scale,
    height: ink.height / scale,
    // centre of the drawing relative to the centre of the box
    offsetX: ((ink.left + ink.right) / 2 - (box.left + box.right) / 2) / scale,
    // top of the drawing relative to the top of the box
    offsetY: (ink.top - box.top) / scale
  };
}

/* Screen-space union of everything that paints, with the same exclusions as
   measureRenderedContent. */
function inkClientRect(svg) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const element of svg.querySelectorAll(MEASURABLE)) {
    if (element.closest(NON_RENDERED)) continue;
    if (element.classList?.contains("today")) continue;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!Number.isFinite(left) || right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function measureDrawnSizeFromViewBox(svg, box, scale) {
  const viewBox = svg.viewBox?.baseVal;
  if (!viewBox?.width || !viewBox?.height) return null;
  const boxWidth = box.width / scale;
  const boxHeight = box.height / scale;
  const [align = "xMidYMid", mode = "meet"] = (svg.getAttribute("preserveAspectRatio") || "xMidYMid meet").trim().split(/\s+/);
  if (align === "none") return { width: boxWidth, height: boxHeight, offsetX: 0, offsetY: 0 };
  const fit = mode === "slice"
    ? Math.max(boxWidth / viewBox.width, boxHeight / viewBox.height)
    : Math.min(boxWidth / viewBox.width, boxHeight / viewBox.height);
  const width = viewBox.width * fit;
  const height = viewBox.height * fit;
  const spareX = boxWidth - width;
  const spareY = boxHeight - height;
  const x = align.slice(0, 4), y = align.slice(4);
  return {
    width,
    height,
    offsetX: x === "xMin" ? -spareX / 2 : x === "xMax" ? spareX / 2 : 0,
    offsetY: y === "YMin" ? 0 : y === "YMax" ? spareY : spareY / 2
  };
}

function toUserSpace(svg, inverse, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(inverse);
}



/* Mermaid's aria-roledescription is the reliable diagram-type signal; these are
   the labels shown in the block header. */
const DIAGRAM_LABELS = {
  "flowchart-v2": "Flowchart", flowchart: "Flowchart", graph: "Flowchart",
  sequence: "Sequence", classDiagram: "Class", class: "Class",
  stateDiagram: "State", state: "State", er: "ER", gantt: "Gantt",
  journey: "Journey", pie: "Pie", quadrantChart: "Quadrant",
  requirement: "Requirement", gitGraph: "Git", c4: "C4", mindmap: "Mindmap",
  timeline: "Timeline", sankey: "Sankey", xychart: "XY Chart", block: "Block",
  packet: "Packet", kanban: "Kanban", architecture: "Architecture",
  radar: "Radar", treemap: "Treemap", venn: "Venn", ishikawa: "Ishikawa",
  wardley: "Wardley", treeView: "Tree", eventmodeling: "Event Model"
};

function diagramLabel(svg) {
  const kind = svg.getAttribute("aria-roledescription") || "";
  return DIAGRAM_LABELS[kind] || (kind ? kind : "Mermaid");
}



/* --------------------------------------------------------------------------
 * Code block headers
 *
 * Every rendered code block gets a header row of its own: language on the
 * left, actions on the right. Obsidian's copy button is moved into that row
 * rather than duplicated, and its edit-block button is placed there by the
 * stylesheet. Clicking the language edits the fence in the Markdown source.
 * -------------------------------------------------------------------------- */

const LANGUAGE_LABELS = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript",
  typescript: "TypeScript", jsx: "JSX", tsx: "TSX", py: "Python",
  python: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java",
  c: "C", cpp: "C++", cs: "C#", sh: "Shell", bash: "Bash", zsh: "Zsh",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  html: "HTML", css: "CSS", scss: "SCSS", sql: "SQL", md: "Markdown",
  markdown: "Markdown", diff: "Diff", dockerfile: "Dockerfile",
  mermaid: "Mermaid", text: "Text", "": "Plain text"
};

function languageOf(code) {
  const match = /language-([\w+#-]+)/.exec(code.getAttribute("class") || "");
  return match ? match[1] : "";
}

function languageLabel(language) {
  return LANGUAGE_LABELS[language.toLowerCase()] || language;
}



/* Inline icons: the header marks a block's kind before its name, the way the
   reference design does. */


/* --------------------------------------------------------------------------
 * Interface language
 *
 * Obsidian writes its UI language onto <html lang>, so the block controls
 * follow the app rather than hardcoding English.
 * -------------------------------------------------------------------------- */

const STRINGS = {
  en: {
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fitTitle: "Fit to width",
    controls: "Zoom controls",
    changeLanguage: "Change the code language",
    copySource: "Copy source",
    copied: "Source copied",
    copyFailed: "Could not find this block's source",
    editSource: "Edit source",
    editFailed: "Could not locate this block in the note",
    renderFailed: "Mermaid failed to render",
    resetCommand: "Reset and fit Mermaid diagrams in active view",
    mermaidLoadFailed: "Bundled Mermaid failed to load; Obsidian's own is still in use",
    resizeColumn: "Drag to resize, double-click to reset",
    resizeRow: "Drag to change row height, double-click to reset",
    density: "Table density",
    density_compact: "Compact",
    density_normal: "Normal",
    density_relaxed: "Relaxed",
    densityCommand: "Cycle table row density",
    resetWidthsCommand: "Reset table column widths in this note",
    widthsReset: "Table column widths reset",
    pieTotal: "Total",
    pieCategory: "Category",
    pieCount: "Count",
    pieRatio: "Ratio"
  },
  zh: {
    zoomOut: "缩小",
    zoomIn: "放大",
    fitTitle: "缩放至适合宽度",
    controls: "缩放控件",
    changeLanguage: "修改代码语言",
    copySource: "复制源码",
    copied: "源码已复制",
    copyFailed: "找不到该区块的源码",
    editSource: "编辑源码",
    editFailed: "无法定位该区块在笔记中的位置",
    renderFailed: "Mermaid 渲染失败",
    resetCommand: "重置并适配当前视图中的 Mermaid 图表",
    mermaidLoadFailed: "插件自带的 Mermaid 加载失败，仍在使用 Obsidian 自带版本",
    resizeColumn: "拖动调整列宽，双击恢复",
    resizeRow: "拖动调整行高，双击恢复",
    density: "表格行高",
    density_compact: "紧凑",
    density_normal: "标准",
    density_relaxed: "宽松",
    densityCommand: "切换表格行高",
    resetWidthsCommand: "重置本笔记的表格列宽",
    widthsReset: "表格列宽已重置",
    pieTotal: "总计",
    pieCategory: "类别",
    pieCount: "数量",
    pieRatio: "占比"
  }
};

function interfaceLanguage() {
  const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
  return lang.startsWith("zh") ? "zh" : "en";
}

function t(key) {
  const table = STRINGS[interfaceLanguage()] || STRINGS.en;
  return table[key] || STRINGS.en[key] || key;
}

/* --------------------------------------------------------------------------
 * Bundled Mermaid
 *
 * Obsidian hardcodes Mermaid ahead of the plugin code-block registry:
 *
 *   if ("mermaid" === lang) { pre.detach(); renderMermaid(...) }
 *   else if (codeBlockPostProcessors.hasOwnProperty(lang)) { ... }
 *
 * so a registerMarkdownCodeBlockProcessor("mermaid", ...) never runs. Its
 * renderer calls the global `mermaid`, which is also where its own copy lives,
 * so the way to get newer diagram families is to put ours in that slot and put
 * Obsidian's back on unload.
 * -------------------------------------------------------------------------- */

const MERMAID_FILE = "mermaid.min.js";
const MERMAID_VERSION = "12.0.0";

/* Diagram families Mermaid ships as separate packages. Each is an esbuild IIFE
   (same shape as mermaid.min.js) loaded only the first time a block of that
   type renders, so the multi-MB bundles cost nothing on startup. */
const EXTERNAL_DIAGRAMS = [
  // @mermaid-js/mermaid-zenuml 1.0.1
  { id: "zenuml", file: "mermaid-zenuml.min.js", global: "mermaid-zenuml", detector: text => /^\s*zenuml/.test(text) }
];

/* The bundles end by publishing themselves from the GLOBAL
   __esbuild_esm_mermaid_nm, which is Obsidian's and lacks our entries; that
   line would throw. Drop it and read the local copy instead. */
function evalEsbuildBundle(source, key) {
  const body = source.replace(/\nglobalThis\["[^"]+"\]\s*=\s*[^\n]*\s*$/, "");
  return new Function(`${body}\n;return __esbuild_esm_mermaid_nm[${JSON.stringify(key)}].default;`)();
}

/* --------------------------------------------------------------------------
 * Balanced layout
 *
 * dagre lays a flowchart out along one axis only, so a long chain comes out
 * as a thin strip. What matters in a note is how large the text ends up once
 * the diagram is fitted to the text column (vertical scrolling is free,
 * horizontal overflow is not), with a penalty for diagrams that run
 * absurdly tall. If the rendered layout would shrink below MIN_READABLE, the
 * flipped direction is rendered too and the more readable one is kept.
 * Opt out per diagram with a `%% ibm:keep-layout` comment.
 * -------------------------------------------------------------------------- */

const COLUMN_WIDTH = 720;
const COMFORTABLE_HEIGHT = 1600;
const MIN_READABLE = 0.6;
const FLOWCHART_HEADER = /^(\s*(?:---[\s\S]*?\n---\s*\n)?(?:%%[^\n]*\n\s*)*(?:flowchart|graph))(?:[ \t]+(LR|RL|TB|TD|BT))?[ \t]*$/m;

function svgSize(svgText) {
  const match = /viewBox="([^"]+)"/.exec(svgText || "");
  if (!match) return null;
  const [, , width, height] = match[1].trim().split(/[\s,]+/).map(Number);
  return width > 0 && height > 0 ? { width, height } : null;
}

/* Scale the text would render at when fitted to the column, discounted when
   the fitted diagram is taller than a comfortable read. */
function readability(size) {
  const scale = Math.min(1, COLUMN_WIDTH / size.width);
  const tall = Math.max(1, (size.height * scale) / COMFORTABLE_HEIGHT);
  return scale / tall;
}

/* ELK (@mermaid-js/layout-elk 1.0.0, rebuilt as one IIFE) is loaded only
   the first time a diagram needs it. Its runElkLayout was patched to pass the
   graph through globalThis.__ibmElkTune before layout, which is where graph
   wrapping gets switched on. */
const ELK_FILE = "mermaid-layout-elk.min.js";
const ELK_ALGORITHMS = ["elk.layered", "elk.stress", "elk.force", "elk.mrtree", "elk.sporeOverlap", "elk.box", "elk.rectpacking"];
let elkWrapRequested = false;

function registerElkLayouts(plugin, mermaid) {
  if (typeof mermaid.registerLayoutLoaders !== "function") return;
  let pending = null;
  const load = async () => {
    pending ||= readAsset(plugin, ELK_FILE).then(source => {
      const layouts = new Function(`${source}\n;return __ibmLayoutElk.default;`)();
      return layouts[0].loader;
    });
    const loader = await pending;
    return loader();
  };
  mermaid.registerLayoutLoaders(ELK_ALGORITHMS.map((algorithm, index) => ({
    name: index === 0 ? "elk" : algorithm,
    loader: load,
    algorithm
  })));

  // Graph wrapping folds a long layered chain into rows until the drawing
  // approaches the aspect ratio. ELK only wraps flat graphs; with compound
  // nodes it is a no-op, which is why only flat flowcharts request it.
  globalThis.__ibmElkTune = graph => {
    if (!elkWrapRequested) return graph;
    graph.layoutOptions = {
      ...(graph.layoutOptions || {}),
      "elk.layered.wrapping.strategy": "MULTI_EDGE",
      "elk.aspectRatio": String(TARGET_ASPECT)
    };
    return graph;
  };
}

const TARGET_ASPECT = 1.6;

function withLayoutDirective(text, layout) {
  const directive = `%%{init: {"layout": "${layout}"}}%%\n`;
  const frontmatter = /^\s*---[\s\S]*?\n---[ \t]*\n/.exec(text);
  return frontmatter
    ? text.slice(0, frontmatter[0].length) + directive + text.slice(frontmatter[0].length)
    : directive + text;
}

function installBalancedLayout(mermaid) {
  const render = mermaid.render.bind(mermaid);
  let counter = 0;
  const attempt = async (id, text, rest, wrap = false) => {
    elkWrapRequested = wrap;
    try {
      const result = await render(`${id}-ibm-alt${counter++}`, text, ...rest);
      const size = svgSize(result.svg);
      return size ? { result, score: readability(size) } : null;
    } catch (_) {
      return null;
    } finally {
      elkWrapRequested = false;
    }
  };

  mermaid.render = async (id, text, ...rest) => {
    const result = await render(id, text, ...rest);
    try {
      if (typeof text !== "string" || /%%\s*ibm:keep-layout/.test(text)) return result;
      // An author who picked a layout engine has made the call already.
      if (/["']?layout["']?\s*:/.test(text)) return result;
      if (!FLOWCHART_HEADER.test(text)) return result;
      const size = svgSize(result.svg);
      if (!size || readability(size) >= MIN_READABLE) return result;

      // Only a flat graph (no subgraphs) can be folded into rows by ELK
      // wrapping. Flipping the axis instead was tried and read worse: a wide
      // strip just became a tall one.
      if (/^\s*subgraph\b/m.test(text)) return result;
      let best = { result, score: readability(size) };
      const wrapped = await attempt(id, withLayoutDirective(text, "elk"), rest, true);
      if (wrapped && wrapped.score > best.score) best = wrapped;
      return best.result;
    } catch (_) {
      return result;
    }
  };
}

/* --------------------------------------------------------------------------
 * Use case crossing reduction
 *
 * The use case layout keeps declaration order, so actors and use cases that
 * talk to each other can end up on opposite sides and their links cross.
 * After the first render, actors are re-ordered by the average height of the
 * use cases they reach, then use cases by the average rank of their actors
 * (the classic two-layer barycentre pass). The reordered source is rendered
 * and kept only if it actually crosses less.
 * -------------------------------------------------------------------------- */

const USECASE_HEADER = /^\s*usecase(?:-beta)?\b/m;
const USECASE_EDGE = /^\s*([A-Za-z_][\w-]*)\s*(?:-->|--|\.\.>[^\s]*|<--)\s*([A-Za-z_][\w-]*)\s*$/;

function usecasePositions(svgText) {
  const positions = new Map();
  const re = /<g[^>]*id="[^"]*-usecase-([^"]+)"[^>]*transform="translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)"/g;
  for (const m of svgText.matchAll(re)) positions.set(m[1], { x: Number(m[2]), y: Number(m[3]) });
  return positions;
}

function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function countCrossings(edges, positions) {
  const segs = edges.map(([from, to]) => [from, to, positions.get(from), positions.get(to)]).filter(e => e[2] && e[3]);
  let crossings = 0;
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const [a1, a2, p1, p2] = segs[i];
      const [b1, b2, q1, q2] = segs[j];
      if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
      if (segmentsCross(p1, p2, q1, q2)) crossings += 1;
    }
  }
  return crossings;
}

function reorderUsecaseSource(text, positions) {
  const lines = text.split("\n");
  const edges = [];
  lines.forEach(line => { const m = USECASE_EDGE.exec(line); if (m) edges.push([m[1], m[2]]); });
  const neighbours = name => edges.flatMap(([a, b]) => (a === name ? [b] : b === name ? [a] : []));
  const meanY = names => {
    const ys = names.map(n => positions.get(n)?.y).filter(v => v !== undefined);
    return ys.length ? ys.reduce((x, y) => x + y, 0) / ys.length : Infinity;
  };
  const declName = line => /^\s*(?:actor\s+)?([A-Za-z_][\w-]*)\s*[(\[]/.exec(line)?.[1];

  // Actors by the mean height of their use cases.
  const actorIdx = lines.map((l, i) => (/^\s*actor\b/.test(l) ? i : -1)).filter(i => i >= 0);
  const actorOrder = actorIdx.map(i => lines[i]).sort((a, b) => meanY(neighbours(declName(a))) - meanY(neighbours(declName(b))));
  const actorRank = new Map(actorOrder.map((l, r) => [declName(l), r]));
  actorIdx.forEach((i, k) => { lines[i] = actorOrder[k]; });

  // Use cases (declared inside a boundary) by the mean rank of their actors,
  // falling back to their current height for ties and actor-less ones.
  let inBoundary = false;
  const caseIdx = [];
  lines.forEach((line, i) => {
    if (/^\s*systemBoundary\b/.test(line)) { inBoundary = true; return; }
    if (inBoundary && /^\s*end\s*$/.test(line)) { inBoundary = false; return; }
    if (inBoundary && declName(line)) caseIdx.push(i);
  });
  const caseKey = line => {
    const name = declName(line);
    const ranks = neighbours(name).map(n => actorRank.get(n)).filter(r => r !== undefined);
    const rank = ranks.length ? ranks.reduce((x, y) => x + y, 0) / ranks.length : Infinity;
    return [rank, positions.get(name)?.y ?? 0];
  };
  const caseOrder = caseIdx.map(i => lines[i]).sort((a, b) => {
    const [ra, ya] = caseKey(a), [rb, yb] = caseKey(b);
    return ra === rb ? ya - yb : ra - rb;
  });
  caseIdx.forEach((i, k) => { lines[i] = caseOrder[k]; });
  return { text: lines.join("\n"), edges };
}

/* Flowchart node shapes are read from the source (the neo look draws
   stadiums, cylinders and subroutines all as outline paths) and stamped on
   the SVG root for decorateFlowchart. */
const FLOW_SHAPE_RE = /([A-Za-z_][\w-]*)\s*(\(\[|\[\(|\[\[|\(\(|\{\{|\{|\[|\(|>)/g;
const FLOW_SHAPES = { "([": "stadium", "[(": "cylinder", "[[": "subroutine", "((": "circle", "{{": "hexagon", "{": "diamond", "[": "rect", "(": "round", ">": "flag" };

const SWIMLANE_HEADER = /^\s*(?:---[\s\S]*?\n---\s*\n)?(?:%%[^\n]*\n\s*)*swimlane(?:-beta)?\b/m;

function installFlowchartShapes(mermaid) {
  const render = mermaid.render.bind(mermaid);
  mermaid.render = async (id, text, ...rest) => {
    const result = await render(id, text, ...rest);
    try {
      if (typeof text !== "string" || !(FLOWCHART_HEADER.test(text) || SWIMLANE_HEADER.test(text))) return result;
      const shapes = {};
      for (const line of text.split("\n")) {
        if (/^\s*(%%|subgraph\b|classDef\b|class\b|style\b|linkStyle\b|click\b)/.test(line)) continue;
        for (const m of line.matchAll(FLOW_SHAPE_RE)) if (!shapes[m[1]]) shapes[m[1]] = FLOW_SHAPES[m[2]];
      }
      const json = JSON.stringify(shapes).replace(/'/g, "&#39;");
      return { ...result, svg: result.svg.replace(/<svg\b/, `<svg data-ibm-shapes='${json}'`) };
    } catch (_) {
      return result;
    }
  };
}

function installUsecaseOrdering(mermaid) {
  const render = mermaid.render.bind(mermaid);
  let counter = 0;
  mermaid.render = async (id, text, ...rest) => {
    const result = await render(id, text, ...rest);
    try {
      if (typeof text !== "string" || !USECASE_HEADER.test(text) || /%%\s*ibm:keep-layout/.test(text)) return result;
      const positions = usecasePositions(result.svg);
      const { text: reordered, edges } = reorderUsecaseSource(text, positions);
      const before = countCrossings(edges, positions);
      if (!before || reordered === text) return result;
      const alternative = await render(`${id}-ibm-uc${counter++}`, reordered, ...rest);
      const after = countCrossings(edges, usecasePositions(alternative.svg));
      return after < before ? alternative : result;
    } catch (_) {
      return result;
    }
  };
}

async function registerExternalDiagrams(plugin, mermaid) {
  if (typeof mermaid.registerExternalDiagrams !== "function") return;
  const definitions = EXTERNAL_DIAGRAMS.map(entry => ({
    id: entry.id,
    detector: entry.detector,
    loader: async () => {
      const source = await readAsset(plugin, entry.file);
      const external = evalEsbuildBundle(source, entry.global);
      return external.loader();
    }
  }));
  await mermaid.registerExternalDiagrams(definitions, { lazyLoad: true });
}

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  look: "classic",
  fontFamily: "inherit",
  // Multiplicity labels must be measured at a readable size before routing.
  // Class diagrams otherwise hardcode these terminals to 11px.
  themeCSS: ".edgeTerminals { font-size: 18px; }",
  // Larger type everywhere. Sizes go through Mermaid's own config so that it
  // measures with them: nodes grow and labels wrap instead of overflowing.
  fontSize: 20,
  themeVariables: {
    fontSize: "20px",
    pieTitleTextSize: "26px",
    pieSectionTextSize: "20px",
    pieLegendTextSize: "18px",
    // Keep short flag names inside compact one-bit cells; the drawing stays
    // at its native size instead of shrinking every label to ~7px.
    packet: { labelFontSize: "10px" }
  },
  // Streamlined connectors; a little extra node padding leaves room for the
  // icons decorateFlowchart adds.
  flowchart: { curve: "basis", padding: 20, htmlLabels: true, wrappingWidth: 260 },
  sequence: { actorFontSize: 19, messageFontSize: 19, noteFontSize: 18, width: 210, height: 70, actorMargin: 70, messageMargin: 50, boxMargin: 14 },
  er: { fontSize: 19, curve: "basis" },
  requirement: { fontSize: 18 },
  journey: { taskFontSize: 18 },
  quadrantChart: { titleFontSize: 26, quadrantLabelFontSize: 20, pointLabelFontSize: 17, xAxisLabelFontSize: 19, yAxisLabelFontSize: 19, pointRadius: 7 },
  xyChart: { titleFontSize: 26, xAxis: { labelFontSize: 18, titleFontSize: 19 }, yAxis: { labelFontSize: 18, titleFontSize: 19 } },
  c4: {
    personFontSize: 18, external_personFontSize: 18,
    systemFontSize: 18, external_systemFontSize: 18,
    system_dbFontSize: 18, external_system_dbFontSize: 18,
    system_queueFontSize: 18, external_system_queueFontSize: 18,
    boundaryFontSize: 19, messageFontSize: 17
  },
  architecture: { fontSize: 20 },
  // Wardley otherwise uses 10px labels, which shrink to ~6px in a reading column.
  // Engine configuration participates in layout; authored diagram config wins.
  "wardley-beta": { labelFontSize: 16, axisFontSize: 14 },
  // Block connectors need room between cards, especially with 20px labels.
  block: { padding: 24 },
  // Keep enough vertical node space without shrinking the whole drawing to
  // half-size when it fits a normal reading column and half an A4 sheet.
  sankey: { width: 900, height: 600, nodeAlignment: "justify", linkColor: "gradient", showValues: false },
  // A 32-bit row at the native 32px bit width exceeds a reading column.
  // Keep the standard 32-bit row, but fit its grid without shrinking labels.
  packet: { bitWidth: 23, paddingX: 2 },
  state: { curve: "basis" },
  // Explicit padding prevents the layout renderer from retaining a previous
  // diagram's optional value; compact compartments still keep full labels.
  class: { curve: "basis", padding: 8 },
  // Gantt: a column-sized canvas avoids halving the type when fitted to
  // reading columns and A4 paper. Mermaid measures labels before layout;
  // diagram-level config (including useWidth and axisFormat) still wins.
  gantt: {
    useWidth: 740,
    // Compact rows keep the native 10px date ticks readable after fitting.
    // The 18px task labels still fit inside a 24px bar without overlap.
    barHeight: 24,
    barGap: 6,
    topPadding: 60,
    leftPadding: 140,
    rightPadding: 40,
    gridLineStartPadding: 45,
    fontSize: 18,
    sectionFontSize: 19,
    titleTopMargin: 28,
    topAxis: false,
    axisFormat: "%m/%d"
  }
};

const USE_CLASSIC_ENGINE = false;
const CLASSIC_FAMILIES = /^\s*(?:---[\s\S]*?\n---\s*\n)?(?:\s*%%[^\n]*\n)*\s*(?:flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram)\b/;

/* Obsidian ships Mermaid 11 at /lib/mermaid.min.js inside the app bundle.
   Evaluate a private copy the same way as the bundled 12. */
async function loadObsidianMermaid() {
  try {
    const response = await fetch("/lib/mermaid.min.js");
    if (!response.ok) return null;
    const source = (await response.text()).replace(/\nglobalThis\["mermaid"\]\s*=[^\n]*\s*$/, "");
    const engine = new Function(`${source}\n;return __esbuild_esm_mermaid_nm.mermaid.default;`)();
    return engine && typeof engine.render === "function" ? engine : null;
  } catch (error) {
    console.warn("[ignorance-advanced] Obsidian's Mermaid unavailable; using the bundled one for everything", error);
    return null;
  }
}

async function loadBundledMermaid(plugin, { publish = true } = {}) {
  const path = `${plugin.manifest.dir}/${MERMAID_FILE}`;
  const source = await readAsset(plugin, MERMAID_FILE);

  const previous = {
    mermaid: globalThis.mermaid,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, "mermaid"),
    esbuild: globalThis.__esbuild_esm_mermaid_nm
  };

  // The bundle declares `var __esbuild_esm_mermaid_nm` — inside new Function
  // that is a LOCAL variable, while its last line publishes from the GLOBAL of
  // the same name, which is Obsidian's. Read it out locally to get the copy we
  // just built.
  const loaded = evalEsbuildBundle(source, "mermaid");
  if (!loaded || typeof loaded.render !== "function") {
    throw new Error("bundled Mermaid did not expose a render()");
  }

  // Obsidian's own Mermaid 11 lays out the families it knows (flowchart,
  // sequence, class, …) noticeably better than 12's reworked layout — 12
  // spreads a clustered flowchart into a thin strip. Load a private copy of
  // it (Obsidian's instance stays Obsidian's) and route by diagram type:
  // 11 for anything it can parse, 12 only for the families 11 lacks.
  // Every diagram renders with the bundled Mermaid 12 (user preference).
  // Routing to Obsidian's Mermaid 11 is kept but switched off: set
  // USE_CLASSIC_ENGINE to true to send CLASSIC_FAMILIES to 11 again.
  const classic = USE_CLASSIC_ENGINE ? await loadObsidianMermaid() : null;
  for (const engine of [loaded, classic].filter(Boolean)) {
    registerElkLayouts(plugin, engine);
    registerLucideIcons(plugin, engine);
    engine.initialize(MERMAID_CONFIG);
  }
  try {
    await registerExternalDiagrams(plugin, loaded);
  } catch (error) {
    console.warn("[ignorance-advanced] external diagrams not registered", error);
  }

  const obsidianInits = [];
  const router = {
    engines: { modern: loaded, classic },
    // Obsidian calls initialize() once its own chunk loads; that config
    // (useMaxWidth, strict security, …) must not replace ours.
    initialize: config => { obsidianInits.push(config); },
    parse: (...args) => loaded.parse(...args),
    // Only the families whose 11 layout is clearly better — and whose styling
    // was checked against 11's DOM — go to 11. Everything else (C4, gantt,
    // pie, journey, the beta families, …) stays on 12, whose DOM the theme
    // and decorations were built for.
    async pick(text) {
      if (!classic || typeof text !== "string" || !CLASSIC_FAMILIES.test(text)) return loaded;
      try {
        return (await classic.parse(text, { suppressErrors: true })) ? classic : loaded;
      } catch (_) {
        return loaded;
      }
    },
    async render(id, text, ...rest) {
      text = mapArchitectureIcons(text);
      const engine = await router.pick(text);
      return withMermaidConfigIsolation(engine, async () => {
        if (/^\s*gantt\b/m.test(text) && engine.mermaidAPI?.getDiagramFromText) {
          try {
            const diagram = await engine.mermaidAPI.getDiagramFromText(text);
            const config = diagram.db.getConfig();
            const interval = ganttTickInterval(diagram.db.getTasks(),
              (config.useWidth || 740) - (config.leftPadding || 0) - (config.rightPadding || 0),
              diagram.db.getTickInterval() || config.tickInterval);
            if (interval) text = text.replace(/^(\s*gantt[^\n]*\n)/m, `$1    tickInterval ${interval}\n`);
          } catch (_) { /* Original rendering retains Mermaid's error handling. */ }
        }
        const result = await withClassNoteLayout(engine, text, () => withClassBoxMeasurement(engine, id, text, () => withWardleyFontConfig(engine, text, () => withClassElkSpacing(text, () => engine.render(id, text, ...rest)), parseYaml)), getComputedStyle(document.body).getPropertyValue("--ib-font-mono").trim());
        // Stamp who drew it, so diagrams Obsidian drew before we loaded can be found.
        return { ...result, svg: result.svg.replace(/<svg\b/, `<svg${/%%\s*ibm:keep-layout/.test(text) ? ' data-ibm-keep-layout=""' : ""} data-ibm-engine="${engine === loaded ? "12" : "11"}"`) };
      });
    }
  };
  installBalancedLayout(router);
  installUsecaseOrdering(router);
  installFlowchartShapes(router);

  /* Obsidian loads its own Mermaid chunk lazily — the first diagram render can
     publish it over ours long after this runs. So hold the global behind an
     accessor: reads always get the router, later writes are remembered but
     ignored, and unload puts the original property back. */
  const overwrites = [];
  if (publish) Object.defineProperty(globalThis, "mermaid", {
    configurable: true,
    enumerable: true,
    get: () => router,
    set: value => { overwrites.push(value); }
  });

  return { mermaid: router, previous, overwrites };
}



export {
  TOKEN_CLASSES,
  TOKEN_PATTERNS,
  tokenRuns,
  buildMermaidDecorations,
  STRUCTURAL_KINDS,
  SERIES_KINDS,
  SERIES_MARKS,
  SERIES_SWATCHES,
  THEMED_KINDS,
  C4_DEFAULTS,
  PERSON_GLYPH,
  SVG_NS_C4,
  cssColorToRgb,
  authorPersonColor,
  stashStyle,
  adoptC4Defaults,
  CLUSTER_GROUPS,
  TAG_ATTRS,
  SVG_NS,
  diagramKind,
  seriesIndex,
  slot,
  applyPaint,
  clearPaint,
  paintDiagram,
  parseTranslate,
  spreadArchitectureServices,
  shiftEdgeEnds,
  whenMeasurable,
  fitVennTitle,
  separateVennLabels,
  arrangeJourneyFaces,
  markGanttSections,
  buildPieTable,
  FLOW_ICONS,
  REQ_ICONS,
  requirementIcon,
  drawRequirementCards,
  decorateUsecase,
  FLOW_KEYWORDS,
  CLUSTER_KEYWORDS,
  flowIcon,
  decorateFlowchart,
  LANE_KEYWORDS,
  decorateSwimlanes,
  PARTICIPANT_KEYWORDS,
  FRAME_TYPES,
  decorateSequence,
  tagGroups,
  tagTreemapLeaves,
  tagSeries,
  markLabelsOver,
  CLASS_ICONS,
  drawClassNotes,
  drawClassCards,
  themeTokens,
  TEXT_TAGS,
  isTextElement,
  hexToRgb,
  parseColor,
  rgbToHsl,
  hslToCss,
  relativeLuminance,
  contrastRatio,
  toneMapForDark,
  NON_RENDERED,
  MEASURABLE,
  measureRenderedContent,
  measureDrawnSize,
  inkClientRect,
  measureDrawnSizeFromViewBox,
  toUserSpace,
  DIAGRAM_LABELS,
  diagramLabel,
  LANGUAGE_LABELS,
  languageOf,
  languageLabel,
  STRINGS,
  interfaceLanguage,
  t,
  MERMAID_FILE,
  MERMAID_VERSION,
  EXTERNAL_DIAGRAMS,
  evalEsbuildBundle,
  COLUMN_WIDTH,
  COMFORTABLE_HEIGHT,
  MIN_READABLE,
  FLOWCHART_HEADER,
  svgSize,
  readability,
  ELK_FILE,
  ELK_ALGORITHMS,
  elkWrapRequested,
  registerElkLayouts,
  TARGET_ASPECT,
  withLayoutDirective,
  installBalancedLayout,
  USECASE_HEADER,
  USECASE_EDGE,
  usecasePositions,
  segmentsCross,
  countCrossings,
  reorderUsecaseSource,
  FLOW_SHAPE_RE,
  FLOW_SHAPES,
  SWIMLANE_HEADER,
  installFlowchartShapes,
  installUsecaseOrdering,
  registerExternalDiagrams,
  MERMAID_CONFIG,
  USE_CLASSIC_ENGINE,
  CLASSIC_FAMILIES,
  loadObsidianMermaid,
  loadBundledMermaid
};
