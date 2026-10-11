/* Parent-state hooks for the theme.

   Stylesheets used `:has()` to style an element by what it contains. That makes the browser re-check every
   ancestor whenever anything inside changes, and Obsidian's scorecard flags it. Instead the few elements that
   are interesting get a marker class or attribute here, once, when their content appears, and the CSS selects
   on the marker. Each rule says: for every element matching `child`, mark `up` (the nearest ancestor matching
   it, or the direct parent) with `cls` / `attr`. */

interface MarkerRule {
  child: string;
  /** Ancestor to mark: nearest match of this selector (child itself excluded). Omit to mark the direct parent. */
  up?: string;
  cls?: string;
  attr?: [string, string];
}

export const MARKER_RULES: MarkerRule[] = [
  // Images aligned through their alt text (`![left](…)`, `![x|right](…)`).
  { child: 'img:is([alt="left"], [alt$="|left"], [alt^="left|"])', up: ".image-embed", attr: ["data-ib-align", "left"] },
  { child: 'img:is([alt="right"], [alt$="|right"], [alt^="right|"])', up: ".image-embed", attr: ["data-ib-align", "right"] },
  { child: ".ib-image-actions", up: ".image-embed", cls: "ib-has-image-actions" },
  { child: ".image-embed > .ib-image-resize-layer", cls: "ib-has-resize-layer" },
  // Table cells that hold nothing but one code span stay as narrow as the code.
  { child: "td > code:only-child", cls: "ib-code-cell" },
  // Rendered blocks inside Live Preview's embed shell.
  { child: ".mermaid.ibm-mermaid-enhanced", up: ".cm-embed-block", cls: "ib-has-mermaid" },
  { child: ".ib-echarts-block", up: ".cm-embed-block", cls: "ib-has-echarts" },
  { child: ".ibm-block-header", up: ".cm-embed-block, .cm-preview-code-block, .el-pre, .el-div", cls: "ib-has-block-header" },
  { child: ".ibm-markdown-preview-block", up: ".cm-embed-block", cls: "ib-has-md-preview" },
  // File explorer rows that carry one of our icons.
  { child: ".ib-file-icon", up: ".nav-file-title, .nav-folder-title", cls: "ib-has-file-icon" },
  // The page toolbar replaces the native reading / bookmark buttons in the view header.
  { child: ".view-actions .view-action svg:is(.lucide-book-open, .lucide-pencil, .lucide-edit-3, .lucide-bookmark)", up: ".view-action", cls: "ib-mode-action" },
  // A paged book hides the native sizer only once a real page exists.
  { child: ".ibp-book > .ibp-page", up: ".ibp-has-book", cls: "ib-has-pages" },
  // Tables with six or more columns get the compact layout.
  { child: "tr > :nth-child(6)", up: "table", cls: "ib-wide-table" },
  // Links that wrap an image or icon do not get the trailing arrow.
  { child: ":is(a.internal-link, a.external-link) :is(img, svg)", up: "a.internal-link, a.external-link", cls: "ib-link-media" },
  // Inline color swatches.
  { child: ".ib-color-swatch", cls: "ib-has-swatch" },
  // ::: containers
  { child: ".ibc-container--gallery > p img", up: ".ibc-container--gallery > p", cls: "ib-has-img" },
  { child: ".ibc-container--matrix > .ibc-matrix__body", cls: "ib-has-body" },
  { child: ".ibc-container--matrix > .ibc-matrix__axis--y", cls: "ib-has-axis-y" },
  // Slides: a leading image paragraph and a column container inside a split slide.
  { child: ".slide-inner > p:first-child img", up: ".slide-inner > p:first-child", cls: "ib-lead-image" },
  { child: ".slide-body > .ibc-container--cols", cls: "ib-has-cols" },
  // Hosted charts.
  { child: ".ib-echarts-block canvas", cls: "ib-canvas-host" },
];

const JOINED = MARKER_RULES.map(rule => rule.child).join(", ");

function mark(target: Element | null, rule: MarkerRule) {
  if (!target) return;
  if (rule.cls) target.classList.add(rule.cls);
  if (rule.attr && target.getAttribute(rule.attr[0]) !== rule.attr[1]) target.setAttribute(rule.attr[0], rule.attr[1]);
}

/** Mark ancestors of everything under (and including) `root` that a rule cares about. */
export function markContext(root: ParentNode & Partial<Element>) {
  const hits: Element[] = [...root.querySelectorAll(JOINED)];
  if (root.matches?.(JOINED)) hits.push(root as Element);
  for (const element of hits) {
    for (const rule of MARKER_RULES) {
      if (!element.matches(rule.child)) continue;
      mark(rule.up ? element.parentElement?.closest(rule.up) ?? null : element.parentElement, rule);
    }
  }
}

/** Remove every marker again (plugin unload). */
export function clearContextMarkers() {
  for (const rule of MARKER_RULES) {
    if (rule.cls) document.querySelectorAll("." + rule.cls).forEach(element => element.classList.remove(rule.cls!));
    if (rule.attr) document.querySelectorAll(`[${rule.attr[0]}="${rule.attr[1]}"]`).forEach(element => element.removeAttribute(rule.attr![0]));
  }
}
