import type { IgnorancePlugin } from "../plugin-types.js";
import { classifyEmphasis, rubyBase, splitLiteralScratch, type Part } from "./prose-compat-core.js";
import { makeChipElement } from "./inline-syntax.js";
import type { InlineSyntaxToken } from "./inline-syntax-source.js";
/* Reading view: the Typora-style inline dialect (tags, scratch cards, breadcrumbs, ruby) drawn with this
   plugin's own chips, so both dialects look the same. */

const KIND: Record<string, Part["kind"]> = { CODE: "code", STRONG: "strong", B: "strong", MARK: "mark", SUP: "sup" };

function describe(em: Element): Part[] {
  return [...em.childNodes].map(node => {
    if (node.nodeType === Node.TEXT_NODE) return { kind: "text", text: node.textContent || "" };
    const kind = KIND[node.nodeName];
    // Nested formatting inside the inner element is not part of this dialect.
    return kind && node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE
      ? { kind, text: node.textContent || "" } : { kind: "other", text: "" };
  });
}

function chip(token: Partial<InlineSyntaxToken> & Pick<InlineSyntaxToken, "type">) {
  return makeChipElement({ kind: "chip", value: "", start: 0, end: 0, source: "", ...token });
}

export function renderCompat(root: HTMLElement) {
  for (const em of [...root.querySelectorAll("em, i")]) {
    if (!em.isConnected || em.closest("code, pre, a, .ib-inline-chip, .ib-inline-badge")) continue;
    const action = classifyEmphasis(describe(em));
    if (!action) continue;
    if (action.type === "pill") em.replaceWith(chip({ type: "pill", value: action.value }));
    else if (action.type === "badge") em.replaceWith(chip({ type: "badge", value: action.value, note: action.note }));
    else if (action.type === "crumb") em.replaceWith(chip({ type: "crumb", value: action.parts.join(" > "), parts: action.parts }));
    else if (action.type === "spoiler") em.replaceWith(createFragment(fragment => {
      fragment.appendText(`${action.tip} `);
      fragment.appendChild(chip({ type: "spoiler", value: action.value }));
    }));
    else if (action.type === "ruby") {
      const previous = em.previousSibling;
      if (previous?.nodeType !== Node.TEXT_NODE || !previous.textContent) continue;
      const text = previous.textContent;
      const base = rubyBase(text);
      previous.textContent = text.slice(0, text.length - base.length);
      em.replaceWith(chip({ type: "ruby", value: base, note: action.note }));
    }
  }
}

/* `*tip**hidden***`, which Obsidian renders as literal stars around a bold run. */
function renderLiteralScratch(root: HTMLElement) {
  for (const strong of [...root.querySelectorAll("strong")]) {
    const before = strong.previousSibling, after = strong.nextSibling;
    if (before?.nodeType !== Node.TEXT_NODE || (after && after.nodeType !== Node.TEXT_NODE) || strong.closest("code, pre, a")) continue;
    if (strong.children.length) continue;
    const split = splitLiteralScratch(before.textContent || "", strong.textContent || "", after?.textContent || "");
    if (!split) continue;
    before.textContent = `${split.prefix}${split.tip} `;
    if (after) after.textContent = split.suffix;
    strong.replaceWith(chip({ type: "spoiler", value: split.value }));
  }
}

export function installProseCompat(plugin: IgnorancePlugin) {
  // Paged reading shows cloned pages, whose scratch cards lost their own listeners.
  plugin.registerDomEvent(document, "click", event => {
    const spoiler = event.target instanceof Element ? event.target.closest(".ibp-book .ib-inline-spoiler") : null;
    spoiler?.classList.toggle("is-revealed");
  });
  plugin.registerMarkdownPostProcessor(element => {
    renderCompat(element);
    renderLiteralScratch(element);
  });
}
