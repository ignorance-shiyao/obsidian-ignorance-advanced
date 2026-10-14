import type { IgnorancePlugin } from "../plugin-types.js";
/* Figure, table, code and equation captions with automatic numbers and cross references, in Reading view.
     ![A caption {#fig-flow}](a.png)       a figure: the alt text becomes "图 1  A caption"
     表：A caption {#tab-sales}             a caption line directly under a table: "表 1  A caption"
     代码：A caption / 公式：A caption       the same under a fenced code block / a $$ equation
     ((ref:fig-flow))                       a link to the figure, shown as its label ("图 1")
   Off by default; turn it on in settings or per note with the `ib-captions` cssclass (`ib-no-captions` turns it off).
   The note's source decides the numbers, so they stay right while sections are rendered out of order. */
export type CaptionKind = "fig" | "tab" | "code" | "eq";
export interface CaptionEntry { line: number; kind: CaptionKind; id?: string; text: string; number: number; label: string }

const SIZE_OR_KEYWORD = /^(?:\d+(?:x\d+)?|left|right|center|gray|sepia|invert|dark-invert|blur)$/i;
const ID_SUFFIX = /\s*\{#([\w-]+)\}\s*$/;
const IMAGE_LINE = /^\s*!\[([^\]\n]*)\]\([^)\n]*\)\s*$/;
const TABLE_CAPTION = /^\s*(?:表|Table)\s*[:：]\s*(.+?)\s*$/i;
const CODE_CAPTION = /^\s*(?:代码|Listing)\s*[:：]\s*(.+?)\s*$/i;
const EQUATION_CAPTION = /^\s*(?:公式|式|Equation)\s*[:：]\s*(.+?)\s*$/i;
const WORDS: Record<CaptionKind, [string, string]> = { fig: ["图", "Figure"], tab: ["表", "Table"], code: ["代码", "Listing"], eq: ["公式", "Equation"] };

const hasCjk = (text: string) => /[㐀-鿿]/.test(text);

function captionText(alt: string): string {
  return alt.split("|").map(part => part.trim()).filter(part => part && !SIZE_OR_KEYWORD.test(part)).join(" ");
}

export function parseCaptions(source: string): CaptionEntry[] {
  const lines = source.split(/\r?\n/);
  const entries: CaptionEntry[] = [];
  const counters: Record<CaptionKind, number> = { fig: 0, tab: 0, code: 0, eq: 0 };
  const containers: string[] = [];
  let fence = "", fenceEnd = -1, mathOpen = false, mathEnd = -1;
  const previousContent = (index: number) => { for (let at = index - 1; at >= 0; at -= 1) if (lines[at].trim()) return at; return -1; };
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      // Closes only on a bare line of the same character and at least the same length.
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) { fence = ""; fenceEnd = index; }
      return;
    }
    if (fence) return;
    const trimmed = line.trim();
    if (trimmed === "$$") { mathOpen = !mathOpen; if (!mathOpen) mathEnd = index; return; }
    if (mathOpen) return;
    if (trimmed.length > 4 && trimmed.startsWith("$$") && trimmed.endsWith("$$")) { mathEnd = index; return; }
    const container = /^\s{0,3}:::\s*([a-z]+)?/i.exec(line);
    if (container) {
      if (container[1]) containers.push(container[1].toLowerCase()); else containers.pop();
      return;
    }
    // Images that belong to a gallery or a before / after pair are not figures of their own.
    if (containers.some(kind => kind === "gallery" || kind === "compare")) return;
    let raw = "";
    let kind: CaptionKind | null = null;
    const image = IMAGE_LINE.exec(line);
    if (image && captionText(image[1])) { raw = captionText(image[1]); kind = "fig"; }
    else {
      const before = previousContent(index);
      const table = TABLE_CAPTION.exec(line), code = CODE_CAPTION.exec(line), equation = EQUATION_CAPTION.exec(line);
      if (table && before >= 0 && /^\s*\|/.test(lines[before])) { raw = table[1]; kind = "tab"; }
      else if (code && before >= 0 && before === fenceEnd) { raw = code[1]; kind = "code"; }
      else if (equation && before >= 0 && before === mathEnd) { raw = equation[1]; kind = "eq"; }
    }
    if (!kind || !raw) return;
    const id = ID_SUFFIX.exec(raw)?.[1];
    const text = raw.replace(ID_SUFFIX, "").trim();
    if (!text) return;
    const number = ++counters[kind];
    const word = WORDS[kind][hasCjk(text) ? 0 : 1];
    entries.push({ line: index, kind, id, text, number, label: `${word} ${number}` });
  });
  return entries;
}

export function wantsCaptions(plugin: IgnorancePlugin, frontmatter) {
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-no-captions")) return false;
  return plugin.state?.captions === true || classes.includes("ib-captions");
}

/** Wrap an image (or its embed placeholder) in a <figure> with a numbered caption. */
export function wrapFigure(holder: Element, entry: CaptionEntry) {
  const figure = createEl("figure", { cls: "ib-figure" });
  if (entry.id) figure.dataset.ibCaptionId = entry.id;
  holder.replaceWith(figure);
  figure.append(holder);
  figure.createEl("figcaption", { cls: "ib-caption" }).append(createSpan({ cls: "ib-caption__label", text: entry.label }), ` ${entry.text}`);
}

/** Turn the caption line's paragraph into the numbered caption. */
export function captionParagraph(paragraph: HTMLElement, entry: CaptionEntry) {
  paragraph.className = `ib-caption ib-caption--${entry.kind}`;
  if (entry.id) paragraph.dataset.ibCaptionId = entry.id;
  paragraph.replaceChildren(createSpan({ cls: "ib-caption__label", text: entry.label }), ` ${entry.text}`);
}

export function captionPattern(kind: CaptionKind) {
  return { fig: null, tab: TABLE_CAPTION, code: CODE_CAPTION, eq: EQUATION_CAPTION }[kind];
}

/** Fill the text of `((ref:…))` elements from a set of entries. */
export function resolveRefs(root: ParentNode, entries: CaptionEntry[]) {
  const lookup = new Map(entries.filter(entry => entry.id).map(entry => [entry.id, entry]));
  for (const holder of root.querySelectorAll<HTMLElement>(".ib-inline-ref")) {
    const target = lookup.get(holder.dataset.ibRef || "");
    holder.textContent = target ? target.label : `?${holder.dataset.ibRef}`;
    holder.classList.toggle("is-missing", !target);
    if (!target) continue;
    holder.addEventListener("click", event => {
      event.preventDefault();
      const scope = holder.closest(".markdown-preview-view, .markdown-rendered, .ibp-book") || document;
      scope.querySelector(`[data-ib-caption-id="${target.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
}

export function installCaptions(plugin: IgnorancePlugin) {
  // A later sort order than the inline syntax pass, so `((ref:…))` already is an element when this runs.
  const process = async (element: HTMLElement, context) => {
    const info = context.getSectionInfo?.(element);
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!info || !file) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    if (!wantsCaptions(plugin, cache?.frontmatter)) return;
    const entries = parseCaptions(info.text);
    if (!entries.length && !element.querySelector(".ib-inline-ref")) return;

    for (const entry of entries) {
      if (entry.line < info.lineStart || entry.line > info.lineEnd) continue;
      if (entry.kind === "fig") {
        // Obsidian turns the .internal-embed placeholder into an image only after post-processors have run.
        const holder = [...element.querySelectorAll(".internal-embed, img")].find(item => !item.closest("figure.ib-figure") && !item.parentElement?.closest(".internal-embed"));
        if (!holder) continue;
        wrapFigure(holder, entry);
      } else {
        const paragraph = element.querySelector("p");
        if (!paragraph) continue;
        captionParagraph(paragraph, entry);
      }
    }

    // References may point to a caption in another section, so they use the whole note.
    const holders = [...element.querySelectorAll<HTMLElement>(".ib-inline-ref")];
    if (!holders.length) return;
    const lookup = new Map(entries.filter(entry => entry.id).map(entry => [entry.id, entry]));
    for (const holder of holders) {
      const target = lookup.get(holder.dataset.ibRef || "");
      holder.textContent = target ? target.label : `?${holder.dataset.ibRef}`;
      holder.classList.toggle("is-missing", !target);
      if (!target) continue;
      holder.addEventListener("click", event => {
        event.preventDefault();
        const root = holder.closest(".markdown-preview-view, .markdown-rendered") || document;
        root.querySelector(`[data-ib-caption-id="${target.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  };
  plugin.registerMarkdownPostProcessor(process, 100);
}
