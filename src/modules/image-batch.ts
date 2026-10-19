import type { IgnorancePlugin } from "../plugin-types.js";
import { MarkdownView, Modal, Notice, TFile } from "obsidian";
import { copyName, extensionFor, findImageRefs, formatBytes, outputType, rewriteRefs, targetSize, type OutputFormat } from "./image-batch-core.js";
/* "Process this note's images": shrink the images the note uses. Results are made in memory first, so the sizes
   are shown before anything is written; confirming saves copies beside the originals and points this note's links at
   them. Originals and other notes are never touched, and the link change is one edit that a single undo reverses. */

interface Row {
  target: string;
  file: TFile;
  before: number;
  state: "waiting" | "working" | "done" | "same" | "failed" | "skipped";
  detail: string;
  bytes?: Uint8Array;
  mime?: string;
  cell?: HTMLElement;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp" };

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const alphaMask = little ? 0xff000000 : 0x000000ff;
  for (const pixel of pixels) if ((pixel & alphaMask) >>> 0 !== alphaMask) return true;
  return false;
}

async function shrink(row: Row, options: { maxEdge: number; quality: number; format: OutputFormat }, data: ArrayBuffer): Promise<void> {
  const sourceMime = MIME[row.file.extension.toLowerCase()] ?? "image/png";
  const bitmap = await createImageBitmap(new Blob([data], { type: sourceMime }));
  const original = { width: bitmap.width, height: bitmap.height };
  try {
    const size = targetSize(bitmap.width, bitmap.height, options.maxEdge) ?? { width: bitmap.width, height: bitmap.height };
    const canvas = createEl("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建画布");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const alpha = sourceMime !== "image/jpeg" && hasTransparency(context, size.width, size.height);
    const mime = outputType(sourceMime, alpha, options.format);
    if (mime === "image/jpeg" && alpha === false && sourceMime !== "image/jpeg") {
      // Flatten onto white so a PNG without transparency does not turn black.
      const flat = createEl("canvas");
      flat.width = size.width; flat.height = size.height;
      const flatContext = flat.getContext("2d");
      if (!flatContext) throw new Error("无法创建画布");
      flatContext.fillStyle = "#fff";
      flatContext.fillRect(0, 0, size.width, size.height);
      flatContext.drawImage(canvas, 0, 0);
      await finish(row, flat, mime, options.quality, size, original);
      return;
    }
    await finish(row, canvas, mime, options.quality, size, original);
  } finally { bitmap.close(); }
}

async function finish(row: Row, canvas: HTMLCanvasElement, mime: string, quality: number, size: { width: number; height: number }, original: { width: number; height: number }) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error("浏览器不能输出这种格式");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const resized = size.width !== original.width || size.height !== original.height;
  if (bytes.byteLength >= row.before && !resized && mime === (MIME[row.file.extension.toLowerCase()] ?? "")) { row.state = "same"; row.detail = "已经够小，保持原图"; return; }
  if (bytes.byteLength >= row.before) { row.state = "same"; row.detail = "处理后没有更小，保持原图"; return; }
  row.state = "done"; row.bytes = bytes; row.mime = mime;
  row.detail = `${formatBytes(row.before)} → ${formatBytes(bytes.byteLength)}（${original.width}×${original.height}${resized ? ` → ${size.width}×${size.height}` : ""}，-${Math.round((1 - bytes.byteLength / row.before) * 100)}%）`;
}

class ImageBatchModal extends Modal {
  private rows: Row[] = [];
  private running = false;
  private cancelled = false;
  private options = { maxEdge: 1600, quality: 0.82, format: "keep" as OutputFormat };
  private runButton: HTMLButtonElement;
  private applyButton: HTMLButtonElement;
  private summary: HTMLElement;

  constructor(private plugin: IgnorancePlugin, private view: MarkdownView, private note: TFile, targets: string[]) {
    super(plugin.app);
    for (const target of targets) {
      const file = plugin.app.metadataCache.getFirstLinkpathDest(target, note.path);
      if (file) this.rows.push({ target, file, before: file.stat.size, state: "waiting", detail: "等待处理" });
    }
  }

  onOpen() {
    this.setTitle("处理本篇的图片");
    const controls = this.contentEl.createDiv({ cls: "ibp-image-batch__controls" });
    const field = (label: string) => { const wrap = controls.createDiv({ cls: "ibp-field" }); wrap.createSpan({ text: label }); return wrap; };
    const edge = field("最长边（像素，0 表示不缩小）").createEl("input", { attr: { type: "number", min: "0", step: "100" } });
    edge.value = String(this.options.maxEdge);
    edge.addEventListener("change", () => { this.options.maxEdge = Math.max(0, Number(edge.value) || 0); this.reset(); });
    const quality = field("质量").createEl("input", { attr: { type: "range", min: "40", max: "100", step: "1" } });
    quality.value = String(Math.round(this.options.quality * 100));
    quality.addEventListener("change", () => { this.options.quality = Number(quality.value) / 100; this.reset(); });
    const format = field("格式").createEl("select");
    format.createEl("option", { value: "keep", text: "保持格式（透明图保持 PNG）" });
    format.createEl("option", { value: "webp", text: "全部转为 .webp 格式" });
    format.addEventListener("change", () => { this.options.format = format.value === "webp" ? "webp" : "keep"; this.reset(); });
    const list = this.contentEl.createDiv({ cls: "ib-link-check ibp-image-batch__list" });
    for (const row of this.rows) {
      const item = list.createDiv({ cls: "ib-link-check__row" });
      item.createSpan({ cls: "ib-link-check__text", text: row.target });
      row.cell = item.createSpan({ cls: "ib-link-check__detail", text: row.detail });
    }
    if (!this.rows.length) list.createDiv({ cls: "ib-form-hint", text: "本篇没有可处理的本地图片（PNG、JPEG、WebP、BMP；GIF 与 SVG 不处理）。" });
    this.summary = this.contentEl.createDiv({ cls: "ib-form-hint" });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    this.runButton = footer.createEl("button", { text: "预览处理结果" });
    this.runButton.disabled = !this.rows.length;
    this.runButton.addEventListener("click", () => { if (this.running) this.cancelled = true; else void this.run(); });
    this.applyButton = footer.createEl("button", { cls: "mod-cta", text: "保存副本并更新本篇引用" });
    this.applyButton.disabled = true;
    this.applyButton.addEventListener("click", () => { void this.apply(); });
  }

  onClose() { this.cancelled = true; this.contentEl.empty(); }

  private show(row: Row) { row.cell?.setText(row.detail); row.cell?.toggleClass("is-error", row.state === "failed"); }

  private reset() {
    for (const row of this.rows) { row.state = "waiting"; row.detail = "等待处理"; row.bytes = undefined; this.show(row); }
    this.applyButton.disabled = true;
    this.summary.setText("");
  }

  private async run() {
    this.running = true; this.cancelled = false;
    this.runButton.setText("取消");
    this.applyButton.disabled = true;
    for (const row of this.rows) {
      if (this.cancelled) break;
      if (row.state === "done" || row.state === "same") continue;
      row.state = "working"; row.detail = "处理中…"; this.show(row);
      try { await shrink(row, this.options, await this.app.vault.readBinary(row.file)); }
      catch (error) { row.state = "failed"; row.detail = `失败：${error instanceof Error ? error.message : String(error)}（再点「预览处理结果」重试）`; }
      this.show(row);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    for (const row of this.rows) if (this.cancelled && row.state === "working") { row.state = "waiting"; row.detail = "已取消"; this.show(row); }
    this.running = false;
    this.runButton.setText("预览处理结果");
    const done = this.rows.filter(row => row.state === "done");
    const saved = done.reduce((sum, row) => sum + row.before - (row.bytes?.byteLength ?? row.before), 0);
    this.summary.setText(done.length ? `${done.length} 张可以变小，合计节省 ${formatBytes(saved)}。保存后原图不动。` : this.cancelled ? "已取消。" : "没有需要处理的图片。");
    this.applyButton.disabled = !done.length;
  }

  // Copies first; the note is edited only if every copy was written, so a failure leaves nothing half-changed.
  private async apply() {
    const done = this.rows.filter(row => row.state === "done" && row.bytes && row.mime);
    this.applyButton.disabled = true;
    const created: TFile[] = [];
    const replacements = new Map<string, string>();
    try {
      for (const row of done) {
        const folder = row.file.parent?.path ?? "";
        const exists = (name: string) => Boolean(this.app.vault.getAbstractFileByPath(`${folder ? `${folder}/` : ""}${name}`));
        const name = copyName(row.file.name, extensionFor(row.mime ?? ""), exists);
        const bytes = row.bytes;
        const file = await this.app.vault.createBinary(`${folder ? `${folder}/` : ""}${name}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        created.push(file);
        replacements.set(row.target, this.app.metadataCache.fileToLinktext(file, this.note.path, false));
      }
      const editor = this.view.editor;
      const source = editor.getValue();
      const next = rewriteRefs(source, findImageRefs(source), replacements);
      let start = 0;
      while (start < source.length && source[start] === next[start]) start += 1;
      let end = 0;
      while (end < source.length - start && end < next.length - start && source[source.length - 1 - end] === next[next.length - 1 - end]) end += 1;
      // One replacement over the changed span, so one undo restores every link.
      editor.replaceRange(next.slice(start, next.length - end), editor.offsetToPos(start), editor.offsetToPos(source.length - end));
      new Notice(`已保存 ${created.length} 张处理后的图片，并更新了本篇的引用。想改回来：撤销一次。`, 8000);
      this.close();
    } catch (error) {
      for (const file of created) await this.app.fileManager.trashFile(file).catch(() => {});
      new Notice(`没有改动：${error instanceof Error ? error.message : String(error)}。已清理刚写入的副本。`, 8000);
      this.applyButton.disabled = false;
    }
  }
}

export function openImageBatch(plugin: IgnorancePlugin) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const note = view?.file;
  if (!view || !note) { new Notice("请先打开一篇笔记"); return; }
  const targets = [...new Set(findImageRefs(view.editor.getValue()).map(ref => ref.target))];
  new ImageBatchModal(plugin, view, note, targets).open();
}
