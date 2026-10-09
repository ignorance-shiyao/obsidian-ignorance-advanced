import { setIcon } from "./ui-icons.js";
/* The light view for a Markdown file outside the vault: nothing is copied, the
   original is read and written by path. 阅读 renders it with Obsidian's
   renderer (theme, ::: containers, diagrams all apply); 编辑 is a plain
   CodeMirror source editor that saves straight back to the file. Obsidian's
   own editor only works on vault files, so live preview, links and search need
   导入到库中编辑. */
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { renderMarkdownWithContainers } from "./containers.js";

const { ItemView, Notice, Platform } = require("obsidian");

export const EXTERNAL_VIEW = "ib-external-markdown";

function fs() { return require("fs"); }
function nodePath() { return require("path"); }

// file:// paths as Obsidian's resource URLs, so <img> can load them.
function resourceUrl(absolute) {
  const prefix = Platform.resourcePathPrefix || "app://local/";
  return prefix + absolute.split("/").map(encodeURIComponent).join("/").replace(/^\//, "");
}

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

// Relative image links point next to the original, not into the vault.
export function rewriteRelativeImages(text, directory, toUrl) {
  const resolve = target => {
    const clean = decodeURI(target.trim().replace(/^<|>$/g, ""));
    return toUrl(nodePath().resolve(directory, clean));
  };
  return text
    .replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g, (whole, alt, target, title) =>
      REMOTE.test(target.replace(/^</, "")) ? whole : `![${alt}](${resolve(target)}${title})`)
    .replace(/!\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g, (whole, target, size) =>
      /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target) ? `![${size || ""}](${resolve(target)})` : whole);
}

export class ExternalMarkdownView extends ItemView {
  constructor(leaf, plugin, importFile) {
    super(leaf);
    this.plugin = plugin;
    this.importFile = importFile;
    this.src = "";
    this.mode = "preview";
    this.text = "";
    this.mtime = 0;
    this.saveTimer = 0;
    this.editor = null;
  }

  getViewType() { return EXTERNAL_VIEW; }
  getDisplayText() { return this.src ? nodePath().basename(this.src, nodePath().extname(this.src)) : "外部文件"; }
  getIcon() { return "lucide-file-symlink"; }
  getState() { return { src: this.src, mode: this.mode }; }

  async setState(state, result) {
    this.src = state?.src || this.src;
    this.mode = state?.mode === "source" ? "source" : "preview";
    await this.reload();
    this.leaf.updateHeader?.();
    return super.setState(state, result);
  }

  async onOpen() {
    this.contentEl.addClass("ib-external-view");
    this.modeButton = this.addAction("lucide-pencil", "编辑", () => this.toggleMode());
    this.addAction("lucide-folder-input", "导入到库中编辑（完整编辑器、双链与搜索）", () => this.importToVault());
    this.addAction("lucide-folder-open", "在访达中显示", () => require("electron").shell.showItemInFolder(this.src));
    // Changed by another app while we were away: show the new text.
    this.registerDomEvent(window, "focus", () => { if (this.app.workspace.getActiveViewOfType(ExternalMarkdownView) === this) void this.reload(); });
  }

  async onClose() {
    await this.flush();
    this.editor?.destroy();
  }

  async reload() {
    if (!this.src) return;
    let stat;
    try { stat = fs().statSync(this.src); } catch (_) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: "ib-external-view__missing", text: `找不到文件：${this.src}` });
      return;
    }
    // Our own pending edits win over a re-read.
    if (this.saveTimer) return;
    if (stat.mtimeMs === this.mtime && this.contentEl.childElementCount) return;
    this.text = fs().readFileSync(this.src, "utf8");
    this.mtime = stat.mtimeMs;
    await this.render();
  }

  async render() {
    this.contentEl.empty();
    this.editor?.destroy();
    this.editor = null;
    setIcon(this.modeButton, this.mode === "source" ? "lucide-book-open" : "lucide-pencil");
    this.modeButton.setAttribute("aria-label", this.mode === "source" ? "阅读" : "编辑");
    const banner = this.contentEl.createDiv({ cls: "ib-external-view__banner" });
    banner.createSpan({ text: this.src });
    if (this.mode === "source") return this.renderEditor();
    const wrapper = this.contentEl.createDiv({ cls: "markdown-reading-view" });
    const preview = wrapper.createDiv({ cls: "markdown-preview-view markdown-rendered ib-external-view__preview" });
    if (this.app.vault.getConfig?.("readableLineLength") !== false) preview.addClass("is-readable-line-width");
    const sizer = preview.createDiv({ cls: "markdown-preview-sizer markdown-preview-section" });
    const text = rewriteRelativeImages(this.text, nodePath().dirname(this.src), resourceUrl);
    // Not a vault note, so section info is missing: render ::: containers up front.
    await renderMarkdownWithContainers(this.plugin, "", text, sizer, this);
  }

  renderEditor() {
    const host = this.contentEl.createDiv({ cls: "ib-external-view__editor markdown-source-view mod-cm6" });
    this.editor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: this.text,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of(update => { if (update.docChanged) this.scheduleSave(); })
        ]
      })
    });
    this.editor.focus();
  }

  scheduleSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 600);
  }

  async flush() {
    if (!this.saveTimer) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.editor) return;
    const text = this.editor.state.doc.toString();
    if (text === this.text) return;
    try {
      // Someone else saved since we read it: keep theirs, write ours beside it.
      const current = fs().statSync(this.src).mtimeMs;
      const target = current > this.mtime + 1 ? this.src.replace(/(\.[^./]+)?$/, " (Obsidian 冲突副本)$1") : this.src;
      fs().writeFileSync(target, text, "utf8");
      if (target !== this.src) { new Notice(`原文件在别处也被修改过，这里的版本另存为：\n${target}`, 10000); return; }
      this.text = text;
      this.mtime = fs().statSync(this.src).mtimeMs;
    } catch (error) {
      new Notice(`保存失败：${error.message || error}`, 8000);
    }
  }

  async toggleMode() {
    await this.flush();
    this.mode = this.mode === "source" ? "preview" : "source";
    await this.render();
    this.app.workspace.requestSaveLayout();
  }

  async importToVault() {
    await this.flush();
    await this.importFile(this.plugin, this.src, this.leaf);
  }
}
