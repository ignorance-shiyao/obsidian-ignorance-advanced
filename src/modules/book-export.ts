import { ExportCancelled } from "./desktop-files.js";
import { Component, MarkdownRenderer, Modal, Notice, moment } from "obsidian";
import { tr } from "../i18n.js";
import type { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { absolutizeLinks, buildEpub, chapterFile, combineMarkdown, imageMime, normalizeLanguage, parseNoteList, type EpubChapter, type EpubImage } from "./epub-core.js";
import { waitUntilSettled } from "./render-ready.js";
import { exportWord, saveExportToVault } from "./export.js";
/* "Combine notes into an ePub": the notes listed in the dialog become chapters in that order. Links between the
   listed notes point at the right chapter, images are embedded once however often they are used, and anything that
   cannot go into an ePub (remote images, scripts, buttons) is dropped and counted in the final notice. */
const DROP = ".ib-block-resize, .callout-icon, .collapse-indicator, script, style, button, .copy-button, .ibm-block-header, .ibm-mermaid-toolbar, .metadata-container, .frontmatter, .frontmatter-container, .ib-table-resize-layer, .ibt-layer, .ib-image-actions, .ib-image-resize-layer, .ibp-table-anchor";

interface BookReport { missingNotes: string[]; charts: number; chartsKept: number; slow: number; missingImages: number; remoteImages: number; brokenLinks: number }

async function renderChapter(plugin: IgnorancePlugin, file: TFile, index: number, chapterOf: Map<string, number>, images: Map<string, string>, store: EpubImage[], report: BookReport): Promise<EpubChapter> {
  const { app } = plugin;
  // Rendered off screen inside the plugin's staging frame: diagrams and charts need a laid-out, attached element,
  // and charts draw as vector graphics there, which is what lets them go into the ePub.
  const stage = document.body.createDiv({ cls: "ibp-staging" });
  stage.setCssProps({ width: "760px" });
  const holder = stage.createDiv({ cls: "markdown-preview-view markdown-rendered" });
  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(app, await app.vault.cachedRead(file), holder, file.path, component);
    if (await waitUntilSettled(holder) === "ceiling") report.slow += 1; // embeds and charts finish after the first pass
    holder.querySelectorAll(DROP).forEach(node => { if (!(node.matches("style") && node.closest("svg"))) node.remove(); });
    // Headings get stable ids (chapter number + position among the note's headings) so links can jump to them.
    const headingIds = (path: string) => (app.metadataCache.getCache(path)?.headings ?? []).map(heading => heading.heading);
    const own = headingIds(file.path), used = new Set<number>();
    for (const heading of Array.from(holder.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
      const text = (heading.getAttribute("data-heading") || heading.textContent || "").trim();
      const at = own.findIndex((name, position) => name.trim() === text && !used.has(position));
      if (at >= 0) { used.add(at); heading.setAttribute("id", `c${index + 1}-h${at}`); }
    }
    // A chart drawn as a vector graphic goes in as an inline SVG; one with no drawing (an error, or a canvas) is left out and counted.
    for (const chart of Array.from(holder.querySelectorAll<HTMLElement>(".ib-echarts-block"))) {
      const svg = chart.dataset.ibEchartsState === "error" ? null : chart.querySelector("svg");
      if (!svg) { chart.remove(); report.charts += 1; continue; }
      for (const name of ["class", "style", "tabindex"]) svg.removeAttribute(name); // the ePub stylesheet sizes svg to the page
      const [width, height] = [svg.getAttribute("width"), svg.getAttribute("height")].map(Number);
      if (!svg.hasAttribute("viewBox") && width > 0 && height > 0) svg.setAttribute("viewBox", `0 0 ${width} ${height}`); // lets it scale down on a narrow page
      chart.replaceWith(createEl("figure", { cls: "ib-epub-chart" }, figure => { figure.append(svg); }));
      report.chartsKept += 1;
    }
    for (const canvas of Array.from(holder.querySelectorAll("canvas"))) { canvas.remove(); report.charts += 1; }
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
  } finally { component.unload(); stage.remove(); }
}

/** The note's own `lang` / `language` property, else Obsidian's interface language. */
function bookLanguage(plugin: IgnorancePlugin, first: TFile): string {
  const frontmatter = plugin.app.metadataCache.getFileCache(first)?.frontmatter;
  const own: unknown = frontmatter?.lang ?? frontmatter?.language;
  return normalizeLanguage(typeof own === "string" ? own : "") ?? normalizeLanguage(moment.locale()) ?? "en";
}

export async function buildBook(plugin: IgnorancePlugin, files: TFile[], meta: { title: string; author: string }): Promise<{ bytes: Uint8Array; report: BookReport }> {
  const chapterOf = new Map(files.map((file, index) => [file.path, index] as const));
  const images = new Map<string, string>();
  const store: EpubImage[] = [];
  const report: BookReport = { missingNotes: [], charts: 0, chartsKept: 0, slow: 0, missingImages: 0, remoteImages: 0, brokenLinks: 0 };
  const chapters: EpubChapter[] = [];
  for (const [index, file] of files.entries()) chapters.push(await renderChapter(plugin, file, index, chapterOf, images, store, report));
  const bytes = await buildEpub({ title: meta.title, author: meta.author, language: bookLanguage(plugin, files[0]), id: `urn:uuid:${crypto.randomUUID()}`, date: new Date().toISOString().replace(/\.\d+Z$/, "Z") }, chapters, store);
  return { bytes, report };
}

/* Picks several notes at once: only Markdown files are listed, a folder can be chosen to list everything in it
   (subfolders included), and "全选" ticks everything currently listed. */
class NotePickerModal extends Modal {
  private picked = new Set<string>();
  constructor(private plugin: IgnorancePlugin, private onDone: (files: TFile[]) => void) { super(plugin.app); }
  onOpen() {
    const { vault } = this.plugin.app;
    this.titleEl.setText(tr("选择要加入的笔记"));
    const files = vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path, "zh"));
    const folders = [...new Set(files.map(file => file.parent?.path ?? "/"))].filter(path => path !== "/").sort((a, b) => a.localeCompare(b, "zh"));
    const bar = this.contentEl.createDiv({ cls: "ib-note-picker__bar" });
    const folder = bar.createEl("select");
    folder.createEl("option", { value: "", text: tr("全部文件夹") });
    for (const path of folders) folder.createEl("option", { value: path, text: path });
    const search = bar.createEl("input", { attr: { type: "search", placeholder: tr("筛选…") } });
    const list = this.contentEl.createDiv({ cls: "ib-note-picker__list" });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    const count = footer.createSpan({ cls: "ib-note-picker__count" });
    const all = footer.createEl("button", { text: tr("全选当前列表") });
    const none = footer.createEl("button", { text: tr("清空选择") });
    const add = footer.createEl("button", { cls: "mod-cta", text: tr("加入") });
    let shown: TFile[] = [];
    const refreshCount = () => { count.setText(tr("已选 {n} 篇", { n: this.picked.size })); add.toggleAttribute("disabled", !this.picked.size); };
    const draw = () => {
      const text = search.value.trim().toLowerCase(), base = folder.value;
      shown = files.filter(file => (!base || file.path.startsWith(`${base}/`)) && file.path.toLowerCase().includes(text));
      list.empty();
      for (const file of shown) {
        const row = list.createEl("label", { cls: "ib-note-picker__row" });
        const box = row.createEl("input", { attr: { type: "checkbox" } });
        box.checked = this.picked.has(file.path);
        box.addEventListener("change", () => { if (box.checked) this.picked.add(file.path); else this.picked.delete(file.path); refreshCount(); });
        row.createSpan({ text: file.path.replace(/\.md$/, "") });
      }
      if (!shown.length) list.createDiv({ cls: "ib-form-hint", text: tr("没有符合条件的笔记") });
      refreshCount();
    };
    folder.addEventListener("change", draw);
    search.addEventListener("input", draw);
    all.addEventListener("click", () => { shown.forEach(file => this.picked.add(file.path)); draw(); });
    none.addEventListener("click", () => { this.picked.clear(); draw(); });
    add.addEventListener("click", () => { this.close(); this.onDone(files.filter(file => this.picked.has(file.path))); });
    draw();
  }
  onClose() { this.contentEl.empty(); }
}

class BookModal extends Modal {
  constructor(private plugin: IgnorancePlugin) { super(plugin.app); }
  onOpen() {
    const { app } = this.plugin;
    this.titleEl.setText(tr("把多篇笔记合成电子书"));
    this.contentEl.createDiv({ cls: "ib-form-hint", text: tr("每行一篇笔记，按这个顺序成章。可以写 [[名称]] 或直接写名称。") });
    const active = app.workspace.getActiveFile();
    const links = active ? (app.metadataCache.getFileCache(active)?.links ?? []).map(link => app.metadataCache.getFirstLinkpathDest(link.link.split("#")[0], active.path)).filter((file): file is TFile => !!file && file.extension === "md") : [];
    const initial = [...new Set([...(active ? [active.path] : []), ...links.map(file => file.path)])].map(path => `[[${path.replace(/\.md$/, "")}]]`).join("\n");
    const area = this.contentEl.createEl("textarea", { cls: "ib-clip-batch__area", attr: { rows: "8", spellcheck: "false" } });
    area.value = initial;
    const pick = this.contentEl.createEl("button", { text: tr("从库中选择笔记或文件夹…") });
    pick.addEventListener("click", () => new NotePickerModal(this.plugin, picked => {
      const known = new Set(parseNoteList(area.value).map(name => app.metadataCache.getFirstLinkpathDest(name, "")?.path));
      const lines = picked.filter(file => !known.has(file.path)).map(file => `[[${file.path.replace(/\.md$/, "")}]]`);
      if (lines.length) area.value = `${area.value.trimEnd()}${area.value.trim() ? "\n" : ""}${lines.join("\n")}`;
    }).open());
    const title = this.contentEl.createEl("input", { attr: { type: "text", placeholder: tr("书名") } });
    title.value = active?.basename ?? "";
    const author = this.contentEl.createEl("input", { attr: { type: "text", placeholder: tr("作者（可留空）") } });
    const status = this.contentEl.createDiv({ cls: "ib-form-hint" });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: tr("取消") }).addEventListener("click", () => this.close());
    const word = footer.createEl("button", { text: tr("生成文档版") });
    const go = footer.createEl("button", { cls: "mod-cta", text: tr("生成电子书") });
    const run = async (kind: "epub" | "word") => {
      const names = parseNoteList(area.value);
      const files: TFile[] = [], missing: string[] = [];
      for (const name of names) {
        const file = app.metadataCache.getFirstLinkpathDest(name, "");
        if (file && file.extension === "md" && !files.includes(file)) files.push(file); else if (!file) missing.push(name);
      }
      if (!files.length) { status.setText(tr("没有找到可用的笔记")); return; }
      if (missing.length) { status.setText(tr("找不到：{v}。请改正后再试。", { v: missing.join("、") })); return; }
      go.setAttr("disabled", "true");
      word.setAttr("disabled", "true");
      status.setText(tr("正在处理 {n} 篇…", { n: files.length }));
      const bookTitle = title.value.trim() || files[0].basename;
      try {
        if (kind === "word") {
          const text = combineMarkdown(await Promise.all(files.map(async file => absolutizeLinks(await app.vault.cachedRead(file),
            target => app.metadataCache.getFirstLinkpathDest(target, file.path)?.path ?? null))));
          const path = await exportWord(this.plugin, files[0], { text, title: bookTitle });
          new Notice(tr("已生成 {path}", { path }), 8000);
        } else {
          const { bytes, report } = await buildBook(this.plugin, files, { title: bookTitle, author: author.value.trim() });
          const path = await saveExportToVault(this.plugin, `${bookTitle}.epub`, bytes);
          const notes = [report.missingImages ? tr("缺失图片 {missingImages}", { missingImages: report.missingImages }) : "", report.remoteImages ? tr("网络图片未收入 {remoteImages}", { remoteImages: report.remoteImages }) : "", report.charts ? tr("图表未收入 {charts}", { charts: report.charts }) : "", report.slow ? tr("渲染超时 {slow} 篇，内容可能不全", { slow: report.slow }) : "", report.brokenLinks ? tr("指向书外的链接改为普通文字 {brokenLinks}", { brokenLinks: report.brokenLinks }) : ""].filter(Boolean);
          new Notice(notes.length ? tr("已生成 {path}（{notes}）", { path, notes: notes.join("，") }) : tr("已生成 {path}", { path }), 10000);
        }
        this.close();
      } catch (error) {
        status.setText(error instanceof ExportCancelled ? tr("已取消保存") : tr("生成失败：{v}", { v: error instanceof Error ? error.message : tr("未知错误") }));
        go.removeAttribute("disabled");
        word.removeAttribute("disabled");
      }
    };
    go.addEventListener("click", () => void run("epub"));
    word.addEventListener("click", () => void run("word"));
  }
  onClose() { this.contentEl.empty(); }
}

export function openBookExport(plugin: IgnorancePlugin) { new BookModal(plugin).open(); }

export function installBookExport(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "export-book-epub", name: tr("把多篇笔记合成电子书"), icon: "lucide-book-open", callback: () => openBookExport(plugin) });
}
