import { colorLabel, colorVar, gradient, parseColorCode, type ColorSpec } from "./color-code-core.js";
/* Colour codes in Reading view and exports (the note keeps its `_~Rd~_` text):
     - after some text (`红色_~Rd~_`): colours what comes right before it; a highlight or underline takes the colour too
     - at the start of a paragraph, list item or cell: colours the whole of it
     - alone on a line in a quote: colours the quote's rail and title
     - `_~Bu!~_` in a table cell: colours the cell's background; `_~RdGn~_` makes a gradient */

const SKIP = "code, pre, .math, .ib-cc-done";

function previousContent(node: Node) {
  let prev = node.previousSibling;
  while (prev && prev.nodeType === Node.TEXT_NODE && !(prev.textContent || "")) prev = prev.previousSibling;
  return prev;
}

function paintText(target: HTMLElement, spec: ColorSpec) {
  const [first] = spec.colors;
  if (spec.colors.length > 1) {
    target.classList.add("ib-cc-gradient");
    target.style.setProperty("--ib-cc-gradient", gradient(spec.colors, 90));
  } else {
    target.classList.add("ib-cc-text");
    target.style.setProperty("--ib-cc", colorVar(first, "text"));
  }
  target.dataset.ibColor = colorLabel(spec.colors);
}

function paintMark(mark: HTMLElement, spec: ColorSpec) {
  mark.classList.add("ib-cc-mark");
  mark.style.setProperty("--ib-cc-bg", spec.colors.length > 1 ? gradient(spec.colors, 90, "fade") : colorVar(spec.colors[0], "fade"));
}

function paintUnderline(u: HTMLElement, spec: ColorSpec) {
  u.classList.add("ib-cc-underline");
  u.style.setProperty("--ib-cc-line", colorVar(spec.colors[0]));
}

function paintCell(cell: HTMLElement, spec: ColorSpec) {
  cell.classList.add("ib-cc-cell");
  cell.style.setProperty("--ib-cc-bg", spec.colors.length > 1 ? gradient(spec.colors, 135, "fade") : colorVar(spec.colors[0], "fade"));
  cell.dataset.ibCellColor = colorLabel(spec.colors);
}

function paintQuote(quote: HTMLElement, spec: ColorSpec) {
  quote.classList.add("ib-cc-quote");
  quote.style.setProperty("--ib-cc", colorVar(spec.colors[0]));
  // The theme draws the quote's rail in the accent colour; the quote takes the code's colour instead.
  quote.style.setProperty("--ib-accent-brand", colorVar(spec.colors[0]));
  quote.style.setProperty("--ib-cc-bg", colorVar(spec.colors[0], "fade"));
}

function apply(code: HTMLElement, spec: ColorSpec) {
  const block = code.parentElement;
  if (!block) return;
  const cell = code.closest<HTMLElement>("td, th");
  if (spec.emphasis && cell) { paintCell(cell, spec); code.remove(); return; }
  const prev = previousContent(code);
  // Alone on the quote's first line: the next thing is a line break or nothing at all.
  let next = code.nextSibling;
  while (next && next.nodeType === Node.TEXT_NODE && !(next.textContent || "").trim()) next = next.nextSibling;
  const lineEnds = !next || (next as Element).tagName === "BR";
  if (!prev && lineEnds && block.tagName === "P" && block.parentElement?.tagName === "BLOCKQUOTE") {
    paintQuote(block.parentElement, spec);
    if (next) next.remove();
    code.remove();
    if (!block.textContent?.trim()) block.remove();
    return;
  }
  if (!prev || (prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim() && !prev.previousSibling)) {
    paintText(block, spec);
    block.querySelectorAll<HTMLElement>("mark").forEach(mark => paintMark(mark, spec));
    block.querySelectorAll<HTMLElement>("u").forEach(u => paintUnderline(u, spec));
    code.remove();
    return;
  }
  let target: HTMLElement;
  if (prev.nodeType === Node.TEXT_NODE) {
    target = createSpan();
    prev.parentNode?.insertBefore(target, prev);
    target.appendChild(prev);
  } else target = prev as HTMLElement;
  if (target.tagName === "MARK") paintMark(target, spec);
  else {
    paintText(target, spec);
    if (target.tagName === "U") paintUnderline(target, spec);
  }
  code.remove();
}

// A code right after a CJK character can stay literal text (`字_~Rd~_` is not emphasis to a strict parser).
const LITERAL = /_(~[a-z0-9]{2,}!?~)_/gi;

function liftLiteralCodes(element: HTMLElement) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node as Text).data.includes("_~")) nodes.push(node as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest(SKIP)) continue;
    const parts = node.data.split(LITERAL);
    if (parts.length < 2) continue;
    const pieces = parts.map((part, index) => index % 2 && parseColorCode(part) ? createEl("em", { text: part }) : part);
    node.replaceWith(...pieces.map((piece, index) => typeof piece === "string" && index % 2 ? `_${piece}_` : piece));
  }
}

export function renderColorCodes(element: HTMLElement) {
  liftLiteralCodes(element);
  for (const em of [...element.querySelectorAll<HTMLElement>("em")]) {
    if (em.closest(SKIP)) continue;
    // A single-tilde strikethrough parser turns `_~Rd~_` into <em><del>Rd</del></em>.
    const only = em.children.length === 1 ? em.firstElementChild : null;
    const text = only && /^(DEL|S)$/.test(only.tagName) && only.textContent === em.textContent ? `~${only.textContent}~` : em.children.length ? "" : em.textContent || "";
    const spec = parseColorCode(text);
    if (spec) apply(em, spec);
  }
}
