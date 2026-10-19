import { Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import type { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { buildEpub, chapterFile, combineMarkdown, imageMime, parseNoteList, type EpubChapter, type EpubImage } from "./epub-core.js";
import { exportWord, saveExportToVault } from "./export.js";
/* "Combine notes into an ePub": the notes listed in the dialog become chapters in that order. Links between the
   listed notes point at the right chapter, images are embedded once however often they are used, and anything that
   cannot go into an ePub (remote images, scripts, buttons) is dropped and counted in the final notice. */
const DROP = "script, style, button, .copy-button, .ibm-block-header, .ibm-mermaid-toolbar, .metadata-container, .frontmatter, .frontmatter-container, .ib-table-resize-layer, .ibt-layer, .ib-image-actions, .ib-image-resize-layer, .ibp-table-anchor";
const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

interface BookReport { missingNotes: string[]; charts: number; missingImages: number; remoteImages: number; brokenLinks: number }

async function renderChapter(plugin: IgnorancePlugin, file: TFile, index: number, chapterOf: Map<string, number>, images: Map<string, string>, store: EpubImage[], report: BookReport): Promise<EpubChapter> {
  const { app } = plugin;
  const holder = createDiv({ cls: "markdown-preview-view markdown-rendered" });
  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(app, await app.vault.cachedRead(file), holder, file.path, component);
    await wait(700); // embeds and charts finish after the first render pass
    holder.querySelectorAll(DROP).forEach(node => node.remove());
    // Headings get stable ids (chapter number + position among the note's headings) so links can jump to them.
    const headingIds = (path: string) => (app.metadataCache.getCache(path)?.headings ?? []).map(heading => heading.heading);
    const own = headingIds(file.path), used = new Set<number>();
    for (const heading of Array.from(holder.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
      const text = (heading.getAttribute("data-heading") || heading.textContent || "").trim();
      const at = own.findIndex((name, position) => name.trim() === text && !used.has(position));
      if (at >= 0) { used.add(at); heading.setAttribute("id", `c${index + 1}-h${at}`); }
    }
    // Charts are drawn on a canvas and cannot be stored in an ePub; they are left out and counted.
    for (const chart of Array.from(holder.querySelectorAll(".ib-echarts-block, canvas"))) { chart.remove(); report.charts += 1; }
    for (const link of Array.from(holder.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
      const [path, anchor = ""] = (link.getAttribute("data-href") || "").split("#");
      const target = path ? app.metadataCache.getFirstLinkpathDest(path, file.path) : file;
      const chapter = target ? chapterOf.get(target.path) : undefined;
      if (chapter === undefined || !target) { link.replaceWith(createSpan({ text: link.textContent || "" })); report.brokenLinks += 1; }
      else {
        const position = anchor ? headingIds(target.path).findIndex(name => name.trim() === decodeURIComponent(anchor).trim()) : -1;
        link.setAttribute("href", `${chapterFile(chapter)}${position >= 0 ? `#c${chapter + 1}-h${position}` : ""}`);
        for (const name of ["data-href", "class", "target", "rel", "data-tooltip-position"]) link.removeAttribute(name);
      }
    }
    for (const image of Array.from(holder.querySelectorAll("img"))) {
      const wrapper = image.closest<HTMLElement>(".internal-embed");
      const reference = wrapper?.getAttribute("src") || image.getAttribute("src") || "";
      if (/^https?:/i.test(reference)) { image.remove(); report.remoteImages += 1; continue; }
      const found = app.metadataCache.getFirstLinkpathDest(decodeURIComponent(reference.split("#")[0].split("?")[0]), file.path);
      const mime = found ? imageMime(found.extension) : null;
      if (!found || !mime) { image.remove(); report.missingImages += 1; continue; }
      let name = images.get(found.path);
      if (!name) {
        name = `img-${String(images.size + 1).padStart(3, "0")}.${found.extension.toLowerCase()}`;
        images.set(found.path, name);
        store.push({ name, mime, data: new Uint8Array(await app.vault.readBinary(found)) });
      }
      const clean = createEl("img", { attr: { src: `images/${name}`, alt: image.getAttribute("alt") || "" } });
      (wrapper ?? image).replaceWith(clean);
    }
    holder.querySelectorAll("*").forEach(node => { for (const attribute of Array.from(node.attributes)) if (/^(on|contenteditable$|draggable$|tabindex$)/i.test(attribute.name)) node.removeAttribute(attribute.name); });
    const title = holder.querySelector("h1")?.textContent?.trim() || file.basename;
    const xml = Array.from(holder.childNodes).map(node => new XMLSerializer().serializeToString(node)).join("").replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
    return { title, body: xml };
  } finally { component.unload(); }
}

export async function buildBook(plugin: IgnorancePlugin, files: TFile[], meta: { title: string; author: string }): Promise<{ bytes: Uint8Array; report: BookReport }> {
  const chapterOf = new Map(files.map((file, index) => [file.path, index] as const));
  const images = new Map<string, string>();
  const store: EpubImage[] = [];
  const report: BookReport = { missingNotes: [], charts: 0, missingImages: 0, remoteImages: 0, brokenLinks: 0 };
  const chapters: EpubChapter[] = [];
  for (const [index, file] of files.entries()) chapters.push(await renderChapter(plugin, file, index, chapterOf, images, store, report));
  const bytes = await buildEpub({ title: meta.title, author: meta.author, language: "zh-CN", id: `urn:uuid:${crypto.randomUUID()}`, date: new Date().toISOString().replace(/\.\d+Z$/, "Z") }, chapters, store);
  return { bytes, report };
}

class BookModal extends Modal {
  constructor(private plugin: IgnorancePlugin) { super(plugin.app); }
  onOpen() {
    const { app } = this.plugin;
    this.titleEl.setText("把多篇笔记合成电子书");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: "每行一篇笔记，按这个顺序成章。可以写 [[名称]] 或直接写名称。" });
    const active = app.workspace.getActiveFile();
    const links = active ? (app.metadataCache.getFileCache(active)?.links ?? []).map(link => app.metadataCache.getFirstLinkpathDest(link.link.split("#")[0], active.path)).filter((file): file is TFile => !!file && file.extension === "md") : [];
    const initial = [...new Set([...(active ? [active.path] : []), ...links.map(file => file.path)])].map(path => `[[${path.replace(/\.md$/, "")}]]`).join("\n");
    const area = this.contentEl.createEl("textarea", { cls: "ib-clip-batch__area", attr: { rows: "8", spellcheck: "false" } });
    area.value = initial;
    const title = this.contentEl.createEl("input", { attr: { type: "text", placeholder: "书名" } });
    title.value = active?.basename ?? "";
    const author = this.contentEl.createEl("input", { attr: { type: "text", placeholder: "作者（可留空）" } });
    const status = this.contentEl.createDiv({ cls: "ib-form-hint" });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const word = footer.createEl("button", { text: "生成文档版" });
    const go = footer.createEl("button", { cls: "mod-cta", text: "生成电子书" });
    const run = async (kind: "epub" | "word") => {
      const names = parseNoteList(area.value);
      const files: TFile[] = [], missing: string[] = [];
      for (const name of names) {
        const file = app.metadataCache.getFirstLinkpathDest(name, "");
        if (file && file.extension === "md" && !files.includes(file)) files.push(file); else if (!file) missing.push(name);
      }
      if (!files.length) { status.setText("没有找到可用的笔记"); return; }
      if (missing.length) { status.setText(`找不到：${missing.join("、")}。请改正后再试。`); return; }
      go.setAttr("disabled", "true");
      word.setAttr("disabled", "true");
      status.setText(`正在处理 ${files.length} 篇…`);
      const bookTitle = title.value.trim() || files[0].basename;
      try {
        if (kind === "word") {
          const text = combineMarkdown(await Promise.all(files.map(file => app.vault.cachedRead(file))));
          const path = await exportWord(this.plugin, files[0], { text, title: bookTitle });
          new Notice(`已生成 ${path}`, 8000);
        } else {
          const { bytes, report } = await buildBook(this.plugin, files, { title: bookTitle, author: author.value.trim() });
          const path = await saveExportToVault(this.plugin, `${bookTitle}.epub`, bytes);
          const notes = [report.missingImages ? `缺失图片 ${report.missingImages}` : "", report.remoteImages ? `网络图片未收入 ${report.remoteImages}` : "", report.charts ? `图表未收入 ${report.charts}` : "", report.brokenLinks ? `指向书外的链接改为普通文字 ${report.brokenLinks}` : ""].filter(Boolean);
          new Notice(`已生成 ${path}${notes.length ? `（${notes.join("，")}）` : ""}`, 10000);
        }
        this.close();
      } catch (error) {
        status.setText(`生成失败：${error instanceof Error ? error.message : "未知错误"}`);
        go.removeAttribute("disabled");
        word.removeAttribute("disabled");
      }
    };
    go.addEventListener("click", () => void run("epub"));
    word.addEventListener("click", () => void run("word"));
  }
  onClose() { this.contentEl.empty(); }
}

export function installBookExport(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "export-book-epub", name: "把多篇笔记合成电子书", icon: "lucide-book-open", callback: () => new BookModal(plugin).open() });
}
