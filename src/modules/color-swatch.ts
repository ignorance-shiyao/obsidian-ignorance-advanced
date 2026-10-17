import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { colorValue, hexColorTags, inlineCodeSpans, isPlainTextColor } from "./color-swatch-core.js";

function makeSwatch(color: string) {
  const dot = createSpan();
  dot.className = "ib-color-swatch";
  dot.style.setProperty("--swatch", color);
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

// Reading view, slides and exports: inline <code> whose whole text is a colour.
export function colorSwatchPostProcessor(el: HTMLElement) {
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
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.includes("#")) texts.push(node as Text);
  for (const node of texts) {
    const matches = hexColorTags(node.textContent).filter(([, color]) => isPlainTextColor(color));
    for (const [at, color] of matches.reverse()) {
      const after = node.splitText(at);
      after.splitText(color.length);
      const wrap = createSpan();
      wrap.className = "ib-color-value";
      after.replaceWith(wrap);
      wrap.append(makeSwatch(color), after);
    }
  }
}

class SwatchWidget extends WidgetType {
  color: string;
  constructor(color: string) { super(); this.color = color; }
  eq(other: SwatchWidget) { return other.color === this.color; }
  toDOM() { return makeSwatch(this.color); }
  ignoreEvent() { return false; }
}

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const marks: [number, string][] = [];
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

class SwatchPlugin {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = buildDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.decorations = buildDecorations(update.view);
    }
  }
}

// Live Preview and source mode.
export const colorSwatchExtension = ViewPlugin.fromClass(SwatchPlugin, { decorations: plugin => plugin.decorations });
