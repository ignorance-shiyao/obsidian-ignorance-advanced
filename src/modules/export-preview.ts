/* Every export opens a preview window first: the result laid out the way the
   exporter will write it (same pagination, skin and canvas), with Cancel and
   Export. Nothing is written until Export is pressed. */
import { applyAppearancePreferences } from "./appearance.js";
import { composePages } from "./reading-pagination.js";
import { stageSlide } from "./offscreen-capture.js";

const { Component, Modal, Platform } = require("obsidian");

const TITLES = {
  pdf: "导出 PDF",
  word: "导出 Word",
  html: "导出 HTML 阅读器",
  pages: "导出分页图片",
  long: "导出长图",
  "pptx-editable": "导出 PPTX（可编辑）",
  "pptx-image": "导出 PPTX（图片版）",
  wechat: "复制为公众号格式",
  zhihu: "复制为知乎格式"
};

const NOTES = {
  word: "Word 的最终版式由 Word 决定，这里是按内容排版的近似效果。",
  "pptx-editable": "文字、表格与图片会成为 PowerPoint 里可编辑的对象，背景与装饰保持为图片。",
  wechat: "粘贴到公众号编辑器后的内容与样式。",
  zhihu: "粘贴到知乎编辑器后的内容与样式。"
};

class ExportPreviewModal extends Modal {
  constructor(plugin, file, kind, deps, run) {
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
    this.titleEl.setText(`${TITLES[this.kind] || "导出"} · 预览`);
    if (NOTES[this.kind]) contentEl.createDiv({ cls: "ibp-export-preview__note", text: NOTES[this.kind] });
    this.viewport = contentEl.createDiv({ cls: "ibp-export-preview__viewport" });
    // A visible busy state: generating a long note takes seconds.
    this.status = this.viewport.createDiv({ cls: "ibp-export-preview__status" });
    this.status.createDiv({ cls: "ibp-export-preview__spinner" });
    const statusText = this.status.createDiv({ cls: "ibp-export-preview__status-text", text: "正在生成预览…" });
    const started = Date.now();
    this.statusTimer = window.setInterval(() => {
      statusText.setText(`正在生成预览… ${Math.round((Date.now() - started) / 1000)} 秒`);
    }, 1000);
    // Opaque while generating: the palette switch behind it would flash the app.
    this.containerEl.addClass("ibp-export-generating");
    const footer = contentEl.createDiv({ cls: "modal-button-container ibp-export-preview__footer" });
    this.summary = footer.createDiv({ cls: "ibp-export-preview__summary" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    this.confirm = footer.createEl("button", { cls: "mod-cta", text: this.kind === "wechat" || this.kind === "zhihu" ? "复制" : "导出" });
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
      this.status.setText(`预览生成失败：${error.message || error}。仍可直接导出。`);
      this.confirm.disabled = false;
    });
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
  fit(element, width) {
    const available = Math.max(200, this.viewport.clientWidth - 32);
    element.style.zoom = String(Math.min(1, available / width));
  }

  async render() {
    const kind = this.kind;
    // The preview window stays on screen while these build (no full-screen stage).
    if (kind === "html") {
      const html = await this.deps.prepareHtmlDocument(this.plugin, this.file, {
        cover: false, signal: this.controller.signal,
        onProgress: async html => { await this.renderFrame(html); this.showPartial("首屏已加载，正在生成后续内容…"); }
      });
      this.controller.signal.throwIfAborted();
      return this.renderFrame(html);
    }
    if (kind === "wechat" || kind === "zhihu") {
      const payload = await this.deps.prepareRichCopyMarkup(this.plugin, this.file, kind, { cover: false });
      return this.renderFrame(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#fff">${payload.html}</body></html>`);
    }
    if (kind.startsWith("pptx")) return this.renderSlides();
    return this.renderPages(kind === "long");
  }

  showPartial(message) {
    this.controller.signal.throwIfAborted();
    this.status.remove();
    window.clearInterval(this.statusTimer);
    this.summary.setText(message);
  }

  async renderFrame(html) {
    this.controller.signal.throwIfAborted();
    const previous = this.frame;
    const scrollTop = previous?.contentWindow?.scrollY || 0;
    const frame = this.viewport.createEl("iframe", { cls: "ibp-export-preview__frame" });
    // Keep the first screen painted while the completed reader loads.
    if (previous) frame.style.visibility = "hidden";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    await new Promise((resolve, reject) => {
      const signal = this.controller.signal;
      const cleanup = () => { clearTimeout(timer); frame.onload = frame.onerror = null; signal.removeEventListener("abort", aborted); };
      const aborted = () => { cleanup(); reject(signal.reason); };
      const timer = window.setTimeout(() => { cleanup(); reject(new Error("预览页面加载超时")); }, 10000);
      signal.addEventListener("abort", aborted, { once: true });
      frame.onload = () => { cleanup(); frame.contentWindow?.scrollTo(0, scrollTop); resolve(); };
      frame.onerror = () => { cleanup(); reject(new Error("预览页面加载失败")); };
      frame.srcdoc = html;
    });
    this.controller.signal.throwIfAborted();
    frame.style.visibility = "";
    if (!previous) frame.addClass("ibp-export-preview__reveal");
    previous?.remove();
    this.frame = frame;
    this.summary.setText("");
  }

  async renderPages(long) {
    this.forceLight();
    const page = this.plugin.state.page;
    const book = this.viewport.createDiv({ cls: "ibp-export-preview__book" });
    for (const [name, value] of Object.entries(this.deps.pageVarsAtFullScale(page))) book.style.setProperty(name, value);
    const text = await this.plugin.app.vault.cachedRead(this.file);
    const result = await composePages(this.plugin, this.file, text, book, this.component, {
      keepStrip: long, signal: this.controller.signal,
      onProgress: !long ? async ({ pages }) => {
        this.fit(book, pages[0]?.getBoundingClientRect().width || 800);
        this.showPartial(`已加载前 ${pages.length} 页，正在生成后续页面…`);
      } : null
    });
    if (!result) throw new Error("页面尺寸无效");
    if (long) {
      result.pages.forEach(sheet => sheet.remove());
      const sheet = book.createDiv({ cls: "ibp-long-sheet" });
      result.staging.removeClass("ibp-staging");
      sheet.appendChild(result.staging);
      this.fit(book, sheet.getBoundingClientRect().width || 800);
      this.summary.setText("一张长图");
      return;
    }
    const width = result.pages[0]?.getBoundingClientRect().width || 800;
    this.fit(book, width);
    this.summary.setText(`共 ${result.pages.length} 页`);
  }

  async renderSlides() {
    this.forceLight();
    const deck = await this.deps.buildDeck(this.plugin, this.file, this.component);
    if (!deck) throw new Error("没有可放映的内容");
    const list = this.viewport.createDiv({ cls: "ibp-export-preview__slides" });
    for (const entry of deck.entries) {
      const staged = stageSlide(deck.reveal, entry.el, deck.width, deck.height);
      const frame = list.createDiv({ cls: "ibp-export-preview__slide" });
      // Move the off-screen stage into the preview, laid out in place.
      staged.stage.style.position = "relative";
      staged.stage.style.left = "0";
      frame.appendChild(staged.stage);
      // Slides read best at a comfortable size, not stretched to the window.
      const available = Math.min(760, Math.max(200, this.viewport.clientWidth - 32));
      frame.style.zoom = String(Math.min(1, available / deck.width));
    }
    this.summary.setText(`共 ${deck.entries.length} 页`);
  }
}

// Show the preview; `run` performs the real export when the user confirms.
export function previewThenExport(plugin, file, kind, deps, run) {
  if (!file) return;
  new ExportPreviewModal(plugin, file, kind, deps, run).open();
}
