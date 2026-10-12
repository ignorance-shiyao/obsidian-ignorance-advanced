/* Live Preview quotes: CodeMirror hangs each quote line with an inline padding and a negative text-indent measured
   from its own gutter. The theme gives quotes a wider inset, so the first line and its wraps would start in
   different places. Reset the inline padding to the stylesheet's and hang by exactly that inset. */
const { ViewPlugin } = require("@codemirror/view");

function align(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".HyperMD-quote").forEach(line => {
    if (line.classList.contains("cm-active")) return;
    if (line.style.paddingInlineStart) line.style.removeProperty("padding-inline-start");
    const pad = parseFloat(getComputedStyle(line).paddingInlineStart);
    if (!Number.isFinite(pad) || pad <= 0) return;
    const indent = `${-pad}px`;
    if (line.style.textIndent !== indent) line.setCssProps(Object.fromEntries([["text-indent", indent]]));
  });
}

export const quoteIndentExtension = ViewPlugin.fromClass(class {
  observer: MutationObserver;
  constructor(view) {
    this.observer = new MutationObserver(() => align(view.contentDOM));
    this.observer.observe(view.contentDOM, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    view.requestMeasure({ read: () => null, write: () => align(view.contentDOM) });
  }
  destroy() { this.observer.disconnect(); }
});
