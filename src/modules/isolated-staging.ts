import type { IgnorancePlugin } from "../plugin-types.js";
/* SVG styles added during native Markdown rendering must not invalidate every
   diagram in the workspace. Keep measurement in its own CSS tree; pages remain
   ordinary DOM clones with the same theme and inherited preferences. */
const styleCaches = new WeakMap<Document, { source: string; sheet: CSSStyleSheet }>();

/* Shorthands whose value can be a var() reference. CSSOM expands such a
   declaration into longhands with empty ("pending substitution") values and
   only the shorthand itself still reports the authored text. */
const SHORTHANDS = [
  "font", "background", "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-style", "border-color", "border-radius", "border-block", "border-inline",
  "border-block-start", "border-block-end", "border-inline-start", "border-inline-end", "outline",
  "margin", "margin-block", "margin-inline", "padding", "padding-block", "padding-inline",
  "inset", "inset-block", "inset-inline", "gap", "flex", "flex-flow", "grid", "grid-area",
  "grid-template", "grid-row", "grid-column", "place-items", "place-content", "place-self",
  "transition", "animation", "list-style", "text-decoration", "text-emphasis", "columns",
  "column-rule", "overflow", "mask", "container", "scroll-margin", "scroll-padding", "offset"
];

function declarations(style: CSSStyleDeclaration) {
  const out: string[] = [];
  let lost = false;
  for (let i = 0; i < style.length; i += 1) {
    const property = style[i];
    const value = style.getPropertyValue(property);
    if (!value) { lost = true; continue; }
    out.push(`${property}: ${value}${style.getPropertyPriority(property) ? " !important" : ""}`);
  }
  if (lost) {
    const shorthands = SHORTHANDS
      .filter(name => style.getPropertyValue(name).includes("var("))
      .map(name => `${name}: ${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? " !important" : ""}`);
    // Shorthands first: longhands that kept a value were authored after them.
    out.unshift(...shorthands);
  }
  return out.join("; ");
}

/* A linked stylesheet's rules as text, with var() shorthands put back. */
export function serializeRules(rules: CSSRuleList | CSSRule[]): string {
  return Array.from(rules, rule => {
    const style = (rule as CSSStyleRule).style;
    const nested = (rule as CSSGroupingRule).cssRules;
    if (style && "selectorText" in rule) {
      const inner = nested?.length ? ` ${serializeRules(nested)}` : "";
      return `${(rule as CSSStyleRule).selectorText} { ${declarations(style)};${inner} }`;
    }
    if (nested && !("keyText" in rule) && !/^@(?:-webkit-)?keyframes\b/.test(rule.cssText)) {
      return `${rule.cssText.slice(0, rule.cssText.indexOf("{")).trim()} { ${serializeRules(nested)} }`;
    }
    return rule.cssText;
  }).join("\n");
}

export function stagingStyleSheet(doc: Document) {
  const cache = styleCaches.get(doc);
  const sources = [...doc.styleSheets].filter(sheet => !sheet.disabled).map(sheet => {
    // CSSOM loses variable shorthand values when a later declaration overrides
    // one side (border + border-left). Prefer the original stylesheet text.
    const inline = sheet.ownerNode?.textContent;
    if (inline?.trim()) return inline;
    return sheet.href ? serializeRules(sheet.cssRules) : [...sheet.cssRules].map(rule => rule.cssText).join("\n");
  });
  const source = sources.join("\n");
  if (cache?.source === source) return cache.sheet;
  const sheet = new (doc.defaultView ?? window).CSSStyleSheet();
  sheet.replaceSync(source);
  styleCaches.set(doc, { source, sheet });
  return sheet;
}

export async function createIsolatedStaging(plugin: IgnorancePlugin, parent: HTMLElement, component, signal?: AbortSignal, sharedSheet?: CSSStyleSheet) {
  const doc = parent.ownerDocument;
  const sheet = sharedSheet || stagingStyleSheet(doc);
  signal?.throwIfAborted();
  const host = doc.createElement('div');
  host.dataset.ibpIsolation = '';
  host.setCssStyles({ display: 'contents' });
  host.setAttribute('aria-hidden', 'true');
  const shadow = host.attachShadow({ mode: 'open' });
  const own = new (doc.defaultView as any).CSSStyleSheet();
  own.replaceSync('body[data-ibp-staging] { display: contents !important; }');
  shadow.adoptedStyleSheets = [sheet, own];
  // A body element, including its inline appearance preferences, is needed for
  // body-scoped typography rules. A div with the same classes is insufficient.
  const body = doc.body.cloneNode(false) as HTMLElement;
  body.removeAttribute('id');
  body.dataset.ibpStaging = '';
  const context = parent.cloneNode(false) as HTMLElement;
  context.removeAttribute('id');
  const staging = doc.createElement('div');
  staging.className = 'ibp-staging markdown-preview-view markdown-rendered';
  context.appendChild(staging); body.appendChild(context); shadow.appendChild(body);
  const observer = new (doc.defaultView as any).MutationObserver(records => {
    const diagrams = new Set<Element>();
    const removed = new Set<Element>();
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('.mermaid')) removed.add(node);
        node.querySelectorAll('.mermaid').forEach((diagram: Element) => removed.add(diagram));
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const owner = node.closest('.mermaid');
        if (owner) diagrams.add(owner);
        node.querySelectorAll('.mermaid').forEach((diagram: Element) => diagrams.add(diagram));
      }
    }
    for (const diagram of removed) if (!diagram.isConnected) plugin.disposeDiagram(diagram);
    if (diagrams.size) plugin.enhanceDiagrams([...diagrams]);
  });
  observer.observe(shadow, { childList: true, subtree: true });
  let disposed = false;
  const remove = staging.remove.bind(staging);
  staging.remove = () => {
    if (disposed) return;
    disposed = true; observer.disconnect();
    for (const diagram of staging.querySelectorAll('.mermaid')) {
      try { plugin.disposeDiagram(diagram); }
      catch (error) { console.warn('Ignorance Advanced: staging cleanup', error); }
    }
    remove(); host.remove();
  };
  component.register(() => staging.remove());
  signal?.throwIfAborted();
  parent.appendChild(host);
  return staging;
}
