import { colorValue, hexColorTags, inlineCodeSpans, isPlainTextColor } from "./color-swatch-core.js";

const { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");
const { RangeSetBuilder } = require("@codemirror/state");
const { syntaxTree } = require("@codemirror/language");

function makeSwatch(color) {
  const dot = document.createElement("span");
  dot.className = "ib-color-swatch";
  dot.style.setProperty("--swatch", color);
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

// Reading view, slides and exports: inline <code> whose whole text is a colour.
export function colorSwatchPostProcessor(el) {
  for (const code of el.querySelectorAll("code")) {
    if (code.closest("pre") || code.querySelector(".ib-color-swatch")) continue;
    const color = colorValue(code.textContent);
    if (color) code.prepend(makeSwatch(color));
  }
  // A bare hex value becomes a tag (#C9561B); treat such tags as colours too.
  for (const tag of el.querySelectorAll("a.tag")) {
    if (tag.querySelector(".ib-color-swatch")) continue;
    const text = tag.textContent.trim();
    if (/^#[0-9a-f]+$/i.test(text) && colorValue(text)) tag.prepend(makeSwatch(text));
  }
  // All-digit hex values (#182435) stay plain text; wrap them so dot and
  // value never break apart.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest("code, pre, a, .ib-color-value, .ib-color-swatch, svg, .mermaid")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.includes("#")) texts.push(node);
  for (const node of texts) {
    const matches = hexColorTags(node.textContent).filter(([, color]) => isPlainTextColor(color));
    for (const [at, color] of matches.reverse()) {
      const after = node.splitText(at);
      after.splitText(color.length);
      const wrap = document.createElement("span");
      wrap.className = "ib-color-value";
      after.replaceWith(wrap);
      wrap.append(makeSwatch(color), after);
    }
  }
}

class SwatchWidget extends WidgetType {
  constructor(color) { super(); this.color = color; }
  eq(other) { return other.color === this.color; }
  toDOM() { return makeSwatch(this.color); }
  ignoreEvent() { return false; }
}

function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const marks = [];
      if (line.text.includes("`")) {
        for (const [start, , text] of inlineCodeSpans(line.text)) {
          const color = colorValue(text);
          if (!color) continue;
          // Only real inline code; fenced code blocks and their backticks are skipped.
          const node = tree.resolveInner(line.from + start, 1);
          if (!/inline-code/.test(node.name) || /codeblock/i.test(node.name)) continue;
          marks.push([line.from + start, color]);
        }
      }
      if (line.text.includes("#")) {
        for (const [hash, color] of hexColorTags(line.text)) {
          // Only where Obsidian parsed a tag (not inside code, links or headings).
          const node = tree.resolveInner(line.from + hash, 1);
          const plain = !/code|url|link|hmd-internal|formatting|comment|math/i.test(node.name) && isPlainTextColor(color);
          if (/hashtag/.test(node.name) || plain) marks.push([line.from + hash, color]);
        }
      }
      marks.sort((a, b) => a[0] - b[0]);
      for (const [at, color] of marks) builder.add(at, at, Decoration.widget({ widget: new SwatchWidget(color), side: 1 }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

// Live Preview and source mode.
export const colorSwatchExtension = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildDecorations(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, { decorations: plugin => plugin.decorations });
