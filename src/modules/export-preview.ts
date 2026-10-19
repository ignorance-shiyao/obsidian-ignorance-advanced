import type { TFile } from "obsidian";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Component, Modal, Platform, setIcon } from "obsidian";
/* Every export opens a preview window first: the result laid out the way the
   exporter will write it (same pagination, skin and canvas), with Cancel and
   Export. Nothing is written until Export is pressed. */
import { applyAppearancePreferences } from "./appearance.js";
import { composePages } from "./reading-pagination.js";
import { stageSlide } from "./offscreen-capture.js";
import { scanExportIssues } from "./export-check-core.js";
import { WORD_FONT_OPTIONS, normalizeWordFont } from "./word-font.js";


const titles = (): Record<string, string> => ({
  pdf: tr("导出 PDF"),
  word: tr("导出 Word"),
  html: tr("导出为 HTML"),
  pages: tr("导出分页图片"),
  long: tr("导出长图"),
  "pptx-editable": tr("导出 PPTX（可编辑）"),
  "pptx-image": tr("导出 PPTX（图片版）"),
  wechat: tr("复制为公众号格式"),
  zhihu: tr("复制为知乎格式")
});

const NOTES: Record<string, string> = {
  word: zh("Word 的最终版式由 Word 决定，这里是按内容排版的近似效果。"),
  "pptx-editable": zh("文字、表格与图片会成为 PowerPoint 里可编辑的对象，背景与装饰保持为图片。"),
  wechat: zh("粘贴到公众号编辑器后的内容与样式。"),
  zhihu: zh("粘贴到知乎编辑器后的内容与样式。")
};

// Builders the preview borrows from the exporters, passed in to avoid an import cycle.
export interface ExportPreviewDeps {
  prepareHtmlDocument(plugin: IgnorancePlugin, file: TFile, options: { cover?: boolean; signal?: AbortSignal; onProgress?: (html: string) => Promise<void> }): Promise<string>;
  prepareRichCopyMarkup(plugin: IgnorancePlugin, file: TFile, kind: string, options: { cover?: boolean }): Promise<{ html: string }>;
  pageVarsAtFullScale(page: unknown): Record<string, string>;
  buildDeck(plugin: IgnorancePlugin, file: TFile, component: Component): Promise<{ reveal: HTMLElement; entries: { el: HTMLElement }[]; width: number; height: number } | null>;
}

// A thin note at the foot of the first-screen preview, so it does not read as the whole document while the rest is still being built.
const loadingBar = (html: string) => html.replace("</body>", "<div style=\"position:fixed;left:0;right:0;bottom:0;padding:10px 16px;text-align:center;font:12px system-ui,sans-serif;color:#64748b;background:linear-gradient(rgba(255,255,255,0),#fff 55%);pointer-events:none\">" + tr("正在加载后续内容…") + "</div></body>");

export class ExportPreviewModal extends Modal {
  plugin: IgnorancePlugin;
  file: TFile;
  kind: string;
  deps: Partial<ExportPreviewDeps>;
  run: () => void;
  component: Component;
  controller: AbortController;
  restoreTheme: (() => void) | null;
  viewport: HTMLDivElement;
  status: HTMLDivElement;
  statusTimer: number;
  summary: HTMLDivElement;
  confirm: HTMLButtonElement;
  frame: HTMLIFrameElement;

  constructor(plugin: IgnorancePlugin, file: TFile, kind: string, deps: Partial<ExportPreviewDeps>, run: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.kind = kind;
    this.deps = deps;
    this.run = run;
    this.component = new Component();
    this.controller = new AbortController();
    this.restoreTheme = null;
  }

  onOpen() {
    const { modalEl, contentEl } = this;
    this.plugin.exportPreview = this;
    modalEl.dataset.exportKind = this.kind;
    modalEl.addClass("ibp-export-preview");
    this.titleEl.setText(tr("{v} · 预览", { v: titles()[this.kind] || tr("导出") }));
    if (NOTES[this.kind]) contentEl.createDiv({ cls: "ibp-export-preview__note", text: tr(NOTES[this.kind]) });
    const report = contentEl.createDiv({ cls: "ibp-export-check" });
    void this.showReport(report);
    this.viewport = contentEl.createDiv({ cls: "ibp-export-preview__viewport" });
    // A visible busy state: generating a long note takes seconds.
    this.status = this.viewport.createDiv({ cls: "ibp-export-preview__status" });
    this.status.createDiv({ cls: "ibp-export-preview__spinner" });
    const statusText = this.status.createDiv({ cls: "ibp-export-preview__status-text", text: tr("正在生成预览…") });
    const started = Date.now();
    this.statusTimer = window.setInterval(() => {
      statusText.setText(tr("正在生成预览… {v} 秒", { v: Math.round((Date.now() - started) / 1000) }));
    }, 1000);
    // Opaque while generating: the palette switch behind it would flash the app.
    this.containerEl.addClass("ibp-export-generating");
    const footer = contentEl.createDiv({ cls: "modal-button-container ibp-export-preview__footer" });
    this.summary = footer.createDiv({ cls: "ibp-export-preview__summary" });
    footer.createEl("button", { text: tr("取消") }).addEventListener("click", () => this.close());
    this.confirm = footer.createEl("button", { cls: "mod-cta", text: this.kind === "wechat" || this.kind === "zhihu" ? tr("复制") : tr("导出") });
    this.confirm.disabled = true;
    this.confirm.addEventListener("click", () => {
      this.close();
      // Run after the window is gone, so the exporter has the screen to itself.
      window.setTimeout(() => this.run(), 50);
    });
    this.component.load();
    // Let the window paint first: rendering a long note keeps the main thread
    // busy for seconds, and started here it held the window back until done.
    const painted = new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.setTimeout(resolve, 0))));
    painted.then(() => {
      if (this.plugin.exportPreview !== this) return false;
      return this.render().then(() => true);
    }).then(async rendered => {
      if (this.controller.signal.aborted) return;
      // Let the completed pages paint before removing the generation overlay
      // and focusing the button. Combining their layout flushes with the last
      // pagination task exceeded the export long-task budget on long notes.
      await new Promise(resolve => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
      if (this.controller.signal.aborted) return;
      this.finishGenerating();
      if (!rendered) return;
      this.status.remove();
      this.confirm.disabled = false;
      // A focus ring on touch screens only looks like a stray outline.
      if (!Platform.isMobile) this.confirm.focus();
    }).catch(error => {
      if (this.controller.signal.aborted) return;
      this.finishGenerating();
      console.error("Ignorance Advanced: export preview failed —", error);
      if (!this.status.isConnected) this.viewport.appendChild(this.status);
      this.summary.setText("");
      this.status.setText(tr("预览生成失败：{v}。仍可直接导出。", { v: error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error) }));
      this.confirm.disabled = false;
    });
  }

  // What this export cannot carry over, read from the note source; a line number jumps to it.
  async showReport(host: HTMLElement) {
    const { app } = this.plugin;
    const source = await app.vault.cachedRead(this.file);
    if (this.controller.signal.aborted) return;
    const wordFont = WORD_FONT_OPTIONS.find(([value]) => value === normalizeWordFont(this.plugin.state.wordFont))?.[1];
    const issues = scanExportIssues(source, {
      kind: this.kind,
      wordFont,
      exists: target => Boolean(app.metadataCache.getFirstLinkpathDest(target, this.file.path) || app.vault.getAbstractFileByPath(target))
    });
    const problems = issues.filter(issue => issue.level === "warn").length;
    if (!issues.length) { host.createDiv({ cls: "ibp-export-check__ok", text: tr("导出检查：没有发现问题") }); return; }
    const box = host.createDiv({ cls: `ibp-export-check__box ${problems ? "is-warn" : "is-info"}` });
    const top = box.createDiv({ cls: "ibp-export-check__top" });
    setIcon(top.createDiv({ cls: "ibp-export-check__symbol" }), problems ? "lucide-triangle-alert" : "lucide-info");
    const content = top.createDiv({ cls: "ibp-export-check__content" });
    content.createSpan({ cls: "ibp-export-check__heading", text: tr("导出检查") });
    content.createSpan({ cls: "ibp-export-check__count", text: problems ? (issues.length > problems ? tr("{problems} 处需要处理，{n} 项说明", { problems, n: issues.length - problems }) : tr("{problems} 处需要处理", { problems })) : tr("{n} 项说明", { n: issues.length }) });
    content.createSpan({ cls: "ibp-export-check__summary", text: issues.map(issue => issue.message).join(" · ") });
    const tools = top.createDiv({ cls: "ibp-export-check__tools" });
    const toggle = tools.createEl("button", { cls: "ibp-export-check__toggle", attr: { type: "button", "aria-expanded": "false" } });
    const toggleText = toggle.createSpan({ text: tr("展开详情") });
    setIcon(toggle.createSpan({ cls: "ibp-export-check__chevron" }), "lucide-chevron-down");
    const close = tools.createEl("button", { cls: "ibp-export-check__close clickable-icon", attr: { type: "button", "aria-label": tr("关闭导出检查提示") } });
    setIcon(close, "lucide-x");
    const list = box.createDiv({ cls: "ibp-export-check__list" });
    const setExpanded = (value: boolean) => {
      box.toggleClass("is-expanded", value);
      toggle.setAttribute("aria-expanded", String(value));
      toggleText.setText(value ? tr("收起详情") : tr("展开详情"));
    };
    toggle.addEventListener("click", () => setExpanded(!box.hasClass("is-expanded")));
    // Things that need fixing are shown open; plain notes stay on one line.
    setExpanded(problems > 0);
    for (const issue of issues) {
      const row = list.createDiv({ cls: `ibp-export-check__row is-${issue.level}` });
      const text = row.createSpan({ cls: "ibp-export-check__text" });
      if (issue.line) {
        const jump = text.createEl("button", { cls: "ibp-export-check__line", text: tr("第 {line} 行", { line: issue.line }), attr: { type: "button" } });
        jump.addEventListener("click", () => {
          this.close();
          void app.workspace.getLeaf(false).openFile(this.file, { eState: { line: issue.line - 1 } });
        });
      }
      text.appendText(issue.message);
    }
    const restore = host.createEl("button", { cls: "ibp-export-check__restore", text: tr("查看导出检查"), attr: { type: "button" } });
    restore.hide();
    close.addEventListener("click", () => new DismissNoticeModal(this.plugin, issues.length, () => { box.hide(); restore.show(); restore.focus(); }).open());
    restore.addEventListener("click", () => { box.show(); restore.hide(); setExpanded(problems > 0); toggle.focus(); });
  }

  finishGenerating() {
    window.clearInterval(this.statusTimer);
    this.containerEl.removeClass("ibp-export-generating");
  }

  onClose() {
    this.controller.abort();
    this.finishGenerating();
    if (this.plugin.exportPreview === this) delete this.plugin.exportPreview;
    this.component.unload();
    this.contentEl.empty();
    this.restoreTheme?.();
  }

  // Exports are always rendered light; show the preview the same way.
  forceLight() {
    const body = document.body;
    if (!body.hasClass("theme-dark")) return;
    body.removeClass("theme-dark");
    body.addClass("theme-light");
    applyAppearancePreferences(this.plugin);
    this.restoreTheme = () => {
      body.removeClass("theme-light");
      body.addClass("theme-dark");
      applyAppearancePreferences(this.plugin);
    };
  }

  // Scale fixed-size content (pages, slides) to the viewport width.
  fit(element: HTMLElement, width: number) {
    const available = Math.max(200, this.viewport.clientWidth - 32);
    element.style.setProperty("zoom", String(Math.min(1, available / width)));
  }

  async render() {
    const kind = this.kind;
    // The preview window stays on screen while these build (no full-screen stage).
    if (kind === "html") {
      const html = await this.deps.prepareHtmlDocument(this.plugin, this.file, {
        cover: false, signal: this.controller.signal,
        onProgress: async (html: string) => { await this.renderFrame(loadingBar(html)); this.showPartial(tr("首屏已加载，正在生成后续内容…")); }
      });
      this.controller.signal.throwIfAborted();
      return this.renderFrame(html);
    }
    if (kind === "wechat" || kind === "zhihu") {
      const payload = await this.deps.prepareRichCopyMarkup(this.plugin, this.file, kind, { cover: false });
      return this.renderFrame(`<!doctype html><html><head><meta charset="utf-8"><style>[data-copy-target]{padding:24px 20px!important}</style></head><body style="margin:0;padding:24px 16px;background:#eef0f3"><div style="box-sizing:border-box;max-width:${kind === "wechat" ? 677 : 720}px;margin:0 auto;padding:0;background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(15,23,42,.08);overflow-wrap:anywhere;overflow:hidden">${payload.html}</div></body></html>`);
    }
    if (kind.startsWith("pptx")) return this.renderSlides();
    return this.renderPages(kind === "long");
  }

  showPartial(message: string) {
    this.controller.signal.throwIfAborted();
    this.status.remove();
    window.clearInterval(this.statusTimer);
    this.summary.setText(message);
  }

  async renderFrame(html: string) {
    this.controller.signal.throwIfAborted();
    const previous = this.frame;
    const scrollTop = previous?.contentWindow?.scrollY || 0;
    const frame = this.viewport.createEl("iframe", { cls: "ibp-export-preview__frame" });
    // Keep the first screen painted while the completed reader loads; the new one fades in over it.
    if (previous) frame.setCssStyles({ opacity: "0" });
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    await new Promise((resolve, reject) => {
      const signal = this.controller.signal;
      const cleanup = () => { window.clearTimeout(timer); frame.onload = frame.onerror = null; signal.removeEventListener("abort", aborted); };
      const aborted = () => { cleanup(); reject(signal.reason instanceof Error ? signal.reason : new Error(tr("预览已取消"))); };
      const timer = window.setTimeout(() => { cleanup(); reject(new Error(tr("预览页面加载超时"))); }, 10000);
      signal.addEventListener("abort", aborted, { once: true });
      frame.onload = () => { cleanup(); frame.contentWindow?.scrollTo(0, scrollTop); resolve(undefined); };
      frame.onerror = () => { cleanup(); reject(new Error(tr("预览页面加载失败"))); };
      frame.srcdoc = html;
    });
    this.controller.signal.throwIfAborted();
    // Wait until the new page has painted, then cross-fade, so nothing blinks or jumps back to the top.
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    this.controller.signal.throwIfAborted();
    if (previous) {
      frame.setCssStyles({ transition: "opacity 0.18s ease", opacity: "1" });
      await new Promise(resolve => window.setTimeout(resolve, 200));
    } else frame.addClass("ibp-export-preview__reveal");
    previous?.remove();
    frame.setCssStyles({ transition: "" });
    this.frame = frame;
    this.summary.setText("");
  }

  async renderPages(long: boolean) {
    this.forceLight();
    const page = this.plugin.state.page;
    const book = this.viewport.createDiv({ cls: "ibp-export-preview__book" });
    for (const [name, value] of Object.entries(this.deps.pageVarsAtFullScale(page))) book.style.setProperty(name, value);
    const text = await this.plugin.app.vault.cachedRead(this.file);
    const result = await composePages(this.plugin, this.file, text, book, this.component, {
      keepStrip: long, signal: this.controller.signal,
      onProgress: !long ? async ({ pages }) => {
        this.fit(book, pages[0]?.getBoundingClientRect().width || 800);
        this.showPartial(tr("已加载前 {n} 页，正在生成后续页面…", { n: pages.length }));
      } : null
    });
    if (!result) throw new Error(tr("页面尺寸无效"));
    if (long) {
      result.pages.forEach(sheet => sheet.remove());
      const sheet = book.createDiv({ cls: "ibp-long-sheet" });
      result.staging.removeClass("ibp-staging");
      sheet.appendChild(result.staging);
      this.fit(book, sheet.getBoundingClientRect().width || 800);
      this.summary.setText(tr("一张长图"));
      return;
    }
    const width = result.pages[0]?.getBoundingClientRect().width || 800;
    this.fit(book, width);
    this.summary.setText(tr("共 {n} 页", { n: result.pages.length }));
  }

  async renderSlides() {
    this.forceLight();
    const deck = await this.deps.buildDeck(this.plugin, this.file, this.component);
    if (!deck) throw new Error(tr("没有可放映的内容"));
    const list = this.viewport.createDiv({ cls: "ibp-export-preview__slides" });
    const total = deck.entries.length;
    const addSlide = (entry: { el: HTMLElement }) => {
      const staged = stageSlide(deck.reveal, entry.el, deck.width, deck.height);
      const frame = list.createDiv({ cls: "ibp-export-preview__slide" });
      // Move the off-screen stage into the preview, laid out in place.
      staged.stage.setCssStyles({ position: "relative" });
      staged.stage.setCssStyles({ left: "0" });
      frame.appendChild(staged.stage);
      // Slides read best at a comfortable size, not stretched to the window.
      const available = Math.min(760, Math.max(200, this.viewport.clientWidth - 32));
      frame.style.setProperty("zoom", String(Math.min(1, available / deck.width)));
    };
    // The first slides appear at once and the rest follow in small batches, without waiting for a scroll,
    // so the preview is usable straight away and never rebuilt.
    const FIRST = 2, BATCH = 3;
    deck.entries.slice(0, FIRST).forEach(addSlide);
    for (let index = FIRST; index < total; index += BATCH) {
      this.showPartial(tr("已加载 {v} / {total} 页，正在继续加载…", { v: Math.min(index, total), total }));
      await new Promise(resolve => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
      this.controller.signal.throwIfAborted();
      deck.entries.slice(index, index + BATCH).forEach(addSlide);
    }
    this.summary.setText(tr("共 {total} 页", { total }));
  }
}

// Show the preview; `run` performs the real export when the user confirms.
export function previewThenExport(plugin: IgnorancePlugin, file: TFile, kind: string, deps: Partial<ExportPreviewDeps>, run: () => void) {
  if (!file) return;
  new ExportPreviewModal(plugin, file, kind, deps, run).open();
}

// Closing the notice hides it for this preview only; the check itself is unchanged.
class DismissNoticeModal extends Modal {
  constructor(plugin: IgnorancePlugin, private count: number, private onConfirm: () => void) { super(plugin.app); }
  onOpen() {
    this.titleEl.setText(tr("关闭导出检查提示？"));
    this.contentEl.createEl("p", { cls: "ibp-export-check__confirm", text: tr("关闭后，本次预览将不再显示这 {n} 项说明。导出过程和潜在的缺图风险不会因此改变。", { n: this.count }) });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    const keep = footer.createEl("button", { text: tr("保留提示") });
    keep.addEventListener("click", () => this.close());
    footer.createEl("button", { cls: "mod-cta", text: tr("确认关闭") }).addEventListener("click", () => { this.close(); this.onConfirm(); });
    keep.focus();
  }
  onClose() { this.contentEl.empty(); }
}
