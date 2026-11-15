import type { IgnorancePlugin } from "../plugin-types.js";
import { parseScripts } from "./prose-extras-core.js";
/* Reading view extras: `~sub~` / `^sup^`, and a quote whose first line is wholly bold becomes its title. */

function excluded(node: Node) {
  return !node.parentElement || !!node.parentElement.closest("code, pre, a, script, style, svg, .math, .mermaid, sub, sup");
}

export function renderScripts(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.instanceOf(Text) && /[~^]/.test(node.nodeValue || "") && !excluded(node)) nodes.push(node);
  }
  for (const node of nodes) {
    const source = node.nodeValue || "";
    const tokens = parseScripts(source);
    if (!tokens.length) continue;
    const fragment = createFragment();
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) fragment.appendText(source.slice(cursor, token.start));
      fragment.createEl(token.kind, { text: token.text });
      cursor = token.end;
    }
    if (cursor < source.length) fragment.appendText(source.slice(cursor));
    node.replaceWith(fragment);
  }
}

export function markQuoteTitles(root: HTMLElement) {
  for (const quote of root.querySelectorAll<HTMLElement>("blockquote")) {
    const first = quote.firstElementChild;
    if (quote.classList.contains("ib-quote-columns")) continue;
    if (!first?.instanceOf(HTMLParagraphElement) || first.classList.contains("ib-quote-title")) continue;
    // The first line only: Obsidian keeps a soft break inside the same paragraph.
    const nodes = [...first.childNodes];
    const breakAt = nodes.findIndex(node => node.nodeName === "BR");
    const head = (breakAt < 0 ? nodes : nodes.slice(0, breakAt)).filter(node => (node.textContent || "").trim());
    if (head.length !== 1 || head[0].nodeName !== "STRONG") continue;
    if (breakAt < 0) { first.addClass("ib-quote-title"); continue; }
    const title = createEl("p", { cls: "ib-quote-title" });
    for (const node of nodes.slice(0, breakAt)) title.appendChild(node);
    nodes[breakAt].remove();
    first.before(title);
  }
}

/** `[<kbd>Go</kbd>](url)`: a link that is only a key cap reads as a button. */
export function markLinkButtons(root: HTMLElement) {
  for (const kbd of root.querySelectorAll("a > kbd")) {
    const link = kbd.parentElement;
    if (link && [...link.childNodes].every(node => node === kbd || !(node.textContent || "").trim())) link.addClass("ib-link-button");
  }
}

export function installProseExtras(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor(element => {
    renderScripts(element);
    markQuoteTitles(element);
    markLinkButtons(element);
  });
}
