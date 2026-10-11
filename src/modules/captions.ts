/* Figure and table captions with automatic numbers and cross references, in Reading view.
     ![A caption {#fig-flow}](a.png)       a figure: the alt text becomes "图 1  A caption"
     表：A caption {#tab-sales}             a caption line directly under a table: "表 1  A caption"
     ((ref:fig-flow))                       a link to the figure, shown as its label ("图 1")
   Off by default; turn it on in settings or per note with the `ib-captions` cssclass (`ib-no-captions` turns it off).
   The note's source decides the numbers, so they stay right while sections are rendered out of order. */
export interface CaptionEntry { line: number; kind: "fig" | "tab"; id?: string; text: string; number: number; label: string }

const SIZE_OR_KEYWORD = /^(?:\d+(?:x\d+)?|left|right|center|gray|sepia|invert|dark-invert|blur)$/i;
const ID_SUFFIX = /\s*\{#([\w-]+)\}\s*$/;
const IMAGE_LINE = /^\s*!\[([^\]\n]*)\]\([^)\n]*\)\s*$/;
const TABLE_CAPTION = /^\s*(?:表|Table)\s*[:：]\s*(.+?)\s*$/i;

const hasCjk = (text: string) => /[㐀-鿿]/.test(text);

function captionText(alt: string): string {
  return alt.split("|").map(part => part.trim()).filter(part => part && !SIZE_OR_KEYWORD.test(part)).join(" ");
}

export function parseCaptions(source: string): CaptionEntry[] {
  const lines = source.split(/\r?\n/);
  const entries: CaptionEntry[] = [];
  let fence = "";
  let figures = 0, tables = 0;
  const containers: string[] = [];
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) { fence = fence ? (marker[1][0] === fence ? "" : fence) : marker[1][0]; return; }
    if (fence) return;
    const container = /^\s{0,3}:::\s*([a-z]+)?/i.exec(line);
    if (container) {
      if (container[1]) containers.push(container[1].toLowerCase()); else containers.pop();
      return;
    }
    // Images that belong to a gallery or a before / after pair are not figures of their own.
    if (containers.some(kind => kind === "gallery" || kind === "compare")) return;
    const image = IMAGE_LINE.exec(line);
    let raw = image ? captionText(image[1]) : "";
    let kind: "fig" | "tab" | null = raw ? "fig" : null;
    if (!kind) {
      const table = TABLE_CAPTION.exec(line);
      const above = lines.slice(0, index).reverse().find(item => item.trim());
      if (table && above && /^\s*\|/.test(above)) { raw = table[1]; kind = "tab"; }
    }
    if (!kind || !raw) return;
    const id = ID_SUFFIX.exec(raw)?.[1];
    const text = raw.replace(ID_SUFFIX, "").trim();
    if (!text) return;
    const number = kind === "fig" ? ++figures : ++tables;
    const word = kind === "fig" ? (hasCjk(text) ? "图" : "Figure") : (hasCjk(text) ? "表" : "Table");
    entries.push({ line: index, kind, id, text, number, label: `${word} ${number}` });
  });
  return entries;
}

function wanted(plugin, frontmatter) {
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-no-captions")) return false;
  return plugin.state?.captions === true || classes.includes("ib-captions");
}

export function installCaptions(plugin) {
  // A later sort order than the inline syntax pass, so `((ref:…))` already is an element when this runs.
  const process = async (element, context) => {
    const info = context.getSectionInfo?.(element);
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!info || !file) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    if (!wanted(plugin, cache?.frontmatter)) return;
    const entries = parseCaptions(info.text);
    if (!entries.length && !element.querySelector(".ib-inline-ref")) return;

    for (const entry of entries) {
      if (entry.line < info.lineStart || entry.line > info.lineEnd) continue;
      if (entry.kind === "fig") {
        // Obsidian turns the .internal-embed placeholder into an image only after post-processors have run.
        const holder = [...element.querySelectorAll(".internal-embed, img")].find(item => !item.closest("figure.ib-figure") && !item.parentElement?.closest(".internal-embed"));
        if (!holder) continue;
        const figure = createEl("figure", { cls: "ib-figure" });
        if (entry.id) figure.dataset.ibCaptionId = entry.id;
        holder.replaceWith(figure);
        figure.append(holder);
        figure.createEl("figcaption", { cls: "ib-caption" }).append(createSpan({ cls: "ib-caption__label", text: entry.label }), ` ${entry.text}`);
      } else {
        const paragraph = element.querySelector("p");
        if (!paragraph) continue;
        paragraph.className = "ib-caption ib-caption--table";
        if (entry.id) paragraph.dataset.ibCaptionId = entry.id;
        paragraph.replaceChildren(createSpan({ cls: "ib-caption__label", text: entry.label }), ` ${entry.text}`);
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
