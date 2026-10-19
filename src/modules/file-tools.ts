import type { Editor, MarkdownFileInfo, MarkdownView, TAbstractFile, TFolder, Vault, WorkspaceLeaf } from "obsidian";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Notice, Setting, TFile, FileView, Modal, htmlToMarkdown, loadPdfJs } from "obsidian";
import type { Menu } from "obsidian";
import { csvToMarkdown, docxToMarkdown, htmlToMarkdown as cleanHtmlToMarkdown, jsonToMarkdown, notionZipToMarkdown, pdfToMarkdown, pptxToMarkdown, xlsxToMarkdown, type PdfJs } from "./import-converters";

const HTML_READONLY_VIEW = "ignorance-html-readonly";
const MARKDOWN_IMPORT_EXTS = new Set(["docx", "pdf", "xlsx", "pptx", "csv", "tsv", "json", "html", "htm", "zip"]);

function fileToolsDefaults() {
  return { convertPastedImages: true };
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error));

/** The entries of a folder, or null when the path holds a file (or nothing). */
function folderChildren(entry: TAbstractFile | null): TAbstractFile[] | null {
  if (!entry || !("children" in entry)) return null;
  const children: unknown = entry.children;
  return Array.isArray(children) ? children as TAbstractFile[] : null;
}

/** A file name without the characters no file system accepts (path separators, wildcards, control characters). */
function hasInvalidNameChar(name: string): boolean {
  return /[\\/:*?"<>|]/.test(name) || Array.from(name).some(char => char.charCodeAt(0) <= 0x1f);
}

type TransferEvent = ClipboardEvent | DragEvent;



function isPastedImageFile(file: File | null) {
  if (!file || typeof file.size !== "number" || file.size <= 0) return false;
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "");
  return type.startsWith("image/") || /\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i.test(name);
}

function pastedImageFiles(event: { clipboardData?: DataTransfer | null; dataTransfer?: DataTransfer | null }): File[] {
  const transfer = event.clipboardData || event.dataTransfer;
  if (!transfer) return [];
  const files: File[] = [];
  for (const item of Array.from(transfer.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isPastedImageFile(file)) files.push(file);
  }
  if (files.length) return files;
  return Array.from(transfer.files || []).filter(isPastedImageFile);
}

function imageTransferRange(event: Event & { clientX?: number; clientY?: number }, editor: Editor, kind: string) {
  if (kind !== "drop") return { from: editor.getCursor("from"), to: editor.getCursor("to") };
  const cm = editor.cm;
  if (!cm || typeof cm.posAtCoords !== "function") return null;
  const offset = cm.posAtCoords({ x: event.clientX ?? 0, y: event.clientY ?? 0 });
  if (typeof offset !== "number") return null;
  const position = editor.offsetToPos(offset);
  return { from: position, to: position };
}

let imageTransferSequence = 0;

function handleImageTransfer(plugin: IgnorancePlugin, event: TransferEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo, kind: string) {
  if (event.defaultPrevented || !plugin.state.fileTools?.convertPastedImages) return;
  const files = pastedImageFiles(event);
  const file = info?.file;
  if (!files.length || !file || typeof file.path !== "string" || String(file.extension).toLowerCase() !== "md") return;

  const range = imageTransferRange(event, editor, kind);
  if (!range) return;
  const randomId = window.crypto?.randomUUID?.() || `${Date.now()}-${++imageTransferSequence}`;
  const marker = `<!-- ignorance-advanced-image-${randomId} -->`;
  const originalText = editor.getRange(range.from, range.to);
  try {
    event.preventDefault();
    editor.replaceRange(marker, range.from, range.to);
  } catch (error) {
    console.error("Ignorance Advanced: 图片粘贴插入点创建失败 —", error);
    new Notice(tr("图片未能插入编辑器：") + errorText(error), 8000);
    return;
  }

  void savePastedImages(plugin, file, files, editor, marker).then(result => {
    if (!replacePendingImageMarker(editor, marker, result.markdown)) {
      return trashPastedImageFiles(plugin, result.createdFiles, result.createdFolder).then(() => {
        new Notice(tr("图片已取消插入，已清理本次生成的附件。"), 6000);
      });
    }
    new Notice(tr("已保存 {n} 张图片到同级 assets/。", { n: result.createdFiles.length }));
  }).catch(error => {
    replacePendingImageMarker(editor, marker, originalText);
    console.error("Ignorance Advanced: 图片粘贴转换失败 —", error);
    new Notice(tr("图片处理失败：") + errorText(error), 8000);
  });
}

function replacePendingImageMarker(editor: Editor, marker: string, replacement: string) {
  try {
    const content = editor.getValue();
    const start = content.indexOf(marker);
    if (start < 0 || content.indexOf(marker, start + marker.length) !== -1) return false;
    editor.replaceRange(replacement, editor.offsetToPos(start), editor.offsetToPos(start + marker.length));
    return true;
  } catch {
    return false;
  }
}

async function encodePastedImage(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "");
  const preserveGif = type === "image/gif" || /\.gif$/i.test(name);
  const preserveWebp = type === "image/webp" || /\.webp$/i.test(name);
  if (preserveGif || preserveWebp) {
    return {
      extension: preserveGif ? "gif" : "webp",
      bytes: new Uint8Array(await file.arrayBuffer())
    };
  }

  if (typeof createImageBitmap !== "function") throw new Error(tr("当前设备无法解码粘贴的图片"));
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = createEl("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error(tr("图片尺寸无效或无法绘制"));
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error(tr("WebP 编码失败"))), "image/webp", 0.85);
    });
    if (blob.type !== "image/webp") throw new Error(tr("当前设备不支持 WebP 编码"));
    return { extension: "webp", bytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    bitmap?.close();
  }
}

function nextPastedImageSequence(vault: Vault, assetDir: string, stem: string) {
  const children = folderChildren(vault.getAbstractFileByPath(assetDir));
  if (!children) return 1;
  const prefix = stem + "-";
  let maximum = 0;
  for (const child of children) {
    if (!child.name.startsWith(prefix)) continue;
    const match = child.name.slice(prefix.length).match(/^(\d+)(?:\.[^.]+)?$/);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum + 1;
}

async function trashPastedImageFiles(plugin: IgnorancePlugin, files: TFile[], folder: TAbstractFile | null) {
  for (const file of [...(files || [])].reverse()) {
    try { await plugin.app.fileManager.trashFile(file); } catch { /* best effort: a file that is already gone needs no cleanup */ }
  }
  if (folder && folderChildren(folder)?.length === 0) {
    try { await plugin.app.fileManager.trashFile(folder); } catch { /* best effort: a folder that is already gone needs no cleanup */ }
  }
}

async function savePastedImages(plugin: IgnorancePlugin, note: TFile, files: File[], editor: Editor, marker: string) {
  const vault = plugin.app.vault;
  const parentPath = note.parent?.path || "";
  const assetDir = [parentPath, "assets"].filter(Boolean).join("/");
  const existingFolder = vault.getAbstractFileByPath(assetDir);
  if (existingFolder && !folderChildren(existingFolder)) throw new Error(tr("assets 路径已被同名文件占用：") + assetDir);
  const stem = safeAssetStem(note.basename || "image");
  let sequence = nextPastedImageSequence(vault, assetDir, stem);
  let createdFolder: TFolder | null = null;
  const createdFiles: TFile[] = [];
  const markdown: string[] = [];

  try {
    for (const file of files) {
      const encoded = await encodePastedImage(file);
      if (!editor.getValue().includes(marker)) throw new Error(tr("编辑位置已取消，未保存图片"));

      if (!vault.getAbstractFileByPath(assetDir)) {
        try {
          createdFolder = await vault.createFolder(assetDir);
        } catch (error) {
          const racedFolder = vault.getAbstractFileByPath(assetDir);
          if (!folderChildren(racedFolder)) throw error;
        }
      }

      let savedFile: TFile | undefined;
      let assetName = "";
      while (!savedFile) {
        assetName = stem + "-" + String(sequence).padStart(2, "0") + "." + encoded.extension;
        const assetPath = assetDir + "/" + assetName;
        if (vault.getAbstractFileByPath(assetPath)) {
          sequence += 1;
          continue;
        }
        const arrayBuffer = encoded.bytes.buffer.slice(encoded.bytes.byteOffset, encoded.bytes.byteOffset + encoded.bytes.byteLength);
        try {
          savedFile = await vault.createBinary(assetPath, arrayBuffer);
        } catch (error) {
          if (vault.getAbstractFileByPath(assetPath)) {
            sequence += 1;
            continue;
          }
          throw error;
        }
      }
      createdFiles.push(savedFile);
      markdown.push(`![${stem}-${String(sequence).padStart(2, "0")}](./assets/${assetName})`);
      sequence += 1;
    }

    return { markdown: markdown.join("\n"), createdFiles, createdFolder };
  } catch (error) {
    await trashPastedImageFiles(plugin, createdFiles, createdFolder);
    throw error;
  }
}

function addFileToolsMenu(plugin: IgnorancePlugin, menu: Menu, file: TAbstractFile) {
  if (!(file instanceof TFile) || !file.extension) return;
  if (isMarkdownImportSource(file)) {
    menu.addSeparator();
    menu.addItem(item => item
      .setTitle(tr("导入为 Markdown"))
      .setIcon("lucide-file-down")
      .onClick(() => new MarkdownImportModal(plugin, file).open()));
  }
}

function isMarkdownImportSource(file: TFile | null | undefined) {
  const extension = String(file?.extension || "").toLowerCase();
  return MARKDOWN_IMPORT_EXTS.has(extension);
}

async function runFileTool(label: string, task: () => Promise<string | undefined>) {
  try {
    const result = await task();
    if (result) new Notice(tr("{label}：{result}", { label, result }), 6000);
  } catch (error) {
    console.error("Ignorance Advanced: " + label + " failed —", error);
    new Notice(tr("{label}失败：{error}", { label, error: errorText(error) }), 8000);
  }
}

function escapeHtmlAttribute(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function htmlReaderDocument(source: string, baseHref: string) {
  const security = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri app:; img-src app: data: blob: https: http:; style-src \'unsafe-inline\' app: data: https: http:; font-src app: data: https: http:; media-src app: data: blob: https: http:">';
  const head = '<base href="' + escapeHtmlAttribute(baseHref) + '">' + security;
  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b[^>]*>/i, (match) => match + head);
  }
  if (/<html\b[^>]*>/i.test(source)) {
    return source.replace(/<html\b[^>]*>/i, (match) => match + "<head>" + head + "</head>");
  }
  return "<!doctype html><html><head>" + head + "</head><body>" + source + "</body></html>";
}

class HtmlReadOnlyView extends FileView {
  renderToken = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return HTML_READONLY_VIEW; }
  getDisplayText() { return this.file?.basename || "HTML"; }
  getIcon() { return "lucide-code-xml"; }
  canAcceptExtension(extension: string) { return ["html", "htm"].includes(String(extension).toLowerCase()); }

  onload() {
    super.onload();
    this.contentEl.addClass("ibm-html-reader-view");
  }

  async onLoadFile(file: TFile) {
    const token = ++this.renderToken;
    this.contentEl.empty();
    const iframe = this.contentEl.createEl("iframe", {
      cls: "ibm-html-reader-frame",
      attr: { title: file.basename + tr("（只读 HTML 预览）"), sandbox: "" }
    });
    iframe.setAttribute("sandbox", "");
    try {
      const source = await this.app.vault.cachedRead(file);
      if (token !== this.renderToken || !iframe.isConnected) return;
      const fileResource = this.app.vault.getResourcePath(file);
      const baseHref = new URL(".", fileResource).href;
      iframe.srcdoc = htmlReaderDocument(source, baseHref);
    } catch (error) {
      if (token !== this.renderToken) return;
      iframe.remove();
      this.contentEl.createDiv({ cls: "ibm-html-reader-error", text: tr("HTML 预览失败：") + errorText(error) });
    }
  }

  async onUnloadFile(file: TFile) {
    this.renderToken += 1;
    this.contentEl.empty();
    return super.onUnloadFile(file);
  }
}

class MarkdownImportModal extends Modal {
  plugin: IgnorancePlugin;
  file: TFile;
  noteName: string;

  constructor(plugin: IgnorancePlugin, file: TFile) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.noteName = file.basename;
  }

  onOpen() {
    const extension = String(this.file.extension || "").toLowerCase();
    this.titleEl.setText(tr("导入为 Markdown"));
    const { contentEl } = this;
    contentEl.empty();
    const description = extension === "docx"
      ? tr("在本机转换 Word 文档；其中的图片会转为 WebP 并放进目标笔记同级的 assets/。")
      : extension === "zip"
        ? tr("按 Notion 导出包导入 Markdown 页面、CSV 表格和图片；页面目录与内链会保留，图片转为 WebP。")
        : tr("本地转换为 Markdown；生成的笔记与源文件放在同一目录。PDF 扫描件暂不做 OCR。");
    contentEl.createEl("p", { text: description });
    new Setting(contentEl).setName(extension === "zip" ? "Notion 导入文件夹" : tr("Markdown 文件名")).setDesc(tr("可改成语义化名称；不会覆盖已有文件。"))
      .addText(text => text.setValue(this.noteName).onChange(value => { this.noteName = value; }));
    new Setting(contentEl).addButton(button => button
      .setButtonText(tr("取消"))
      .onClick(() => this.close()))
      .addButton(button => button
        .setButtonText(tr("开始导入"))
        .setCta()
        .onClick(() => { void this.startImport(); }));
  }

  private async startImport() {
    const noteName = this.noteName.trim().replace(/\.md$/i, "");
    if (!noteName || hasInvalidNameChar(noteName) || noteName === "." || noteName === "..") {
      new Notice(tr("请填写有效的 Markdown 文件名"));
      return;
    }
    this.close();
    await runFileTool(tr("导入 Markdown"), () => importVaultFileAsMarkdown(this.plugin, this.file, noteName));
  }
}

async function createMissingVaultFolders(vault: Vault, targetPaths: string[], created: TFolder[] = []) {
  const folders = new Set<string>();
  for (const target of targetPaths) {
    const segments = String(target).split("/").filter(Boolean);
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) folders.add(segments.slice(0, index).join("/"));
  }
  for (const folderPath of [...folders].sort((a, b) => a.split("/").length - b.split("/").length)) {
    const existing = vault.getAbstractFileByPath(folderPath);
    if (existing) {
      if (!folderChildren(existing)) throw new Error(tr("目标目录被同名文件占用：") + folderPath);
      continue;
    }
    try {
      created.push(await vault.createFolder(folderPath));
    } catch (error) {
      const racedFolder = vault.getAbstractFileByPath(folderPath);
      if (!folderChildren(racedFolder)) throw error;
    }
  }
  return created;
}

async function rollbackImportedFiles(plugin: IgnorancePlugin, files: TAbstractFile[], folders: TAbstractFile[] = []) {
  const failures: string[] = [];
  for (const file of [...files].reverse()) {
    try { await plugin.app.fileManager.trashFile(file); } catch { failures.push(file.path); }
  }
  for (const folder of [...folders].reverse()) {
    try {
      if (folderChildren(folder)?.length === 0) await plugin.app.fileManager.trashFile(folder);
    } catch { failures.push(folder.path); }
  }
  return failures;
}

async function openImportedNote(plugin: IgnorancePlugin, note: TFile) {
  try {
    await plugin.app.workspace.getLeaf(false).openFile(note);
  } catch (error) {
    new Notice(tr("已导入 {path}，但未能自动打开：{error}", { path: note.path, error: errorText(error) }), 8000);
  }
}

async function importVaultFileAsMarkdown(plugin: IgnorancePlugin, file: TFile, noteName: string) {
  if (!isMarkdownImportSource(file)) throw new Error(tr("不支持导入此文件类型"));
  const extension = String(file.extension).toLowerCase();
  const normalizedName = normalizeMarkdownImportName(noteName);
  if (extension === "docx") return importDocxAsMarkdown(plugin, file, normalizedName);
  if (extension === "zip") return importNotionZipAsMarkdown(plugin, file, normalizedName);

  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const notePath = [parentPath, normalizedName + ".md"].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(notePath)) throw new Error(tr("目标笔记已存在：") + notePath);

  const text = () => vault.cachedRead(file);
  const bytes = async () => new Uint8Array(await vault.readBinary(file));
  let markdown: string;
  switch (extension) {
    case "csv": markdown = csvToMarkdown(await text(), ","); break;
    case "tsv": markdown = csvToMarkdown(await text(), "\t"); break;
    case "json": markdown = jsonToMarkdown(await text()); break;
    case "html":
    case "htm": markdown = await cleanHtmlToMarkdown(await text(), htmlToMarkdown); break;
    case "xlsx": markdown = await xlsxToMarkdown(await bytes()); break;
    case "pptx": markdown = await pptxToMarkdown(await bytes()); break;
    case "pdf": markdown = await pdfToMarkdown(await bytes(), (await loadPdfJs()) as PdfJs); break;
    default: throw new Error(tr("不支持导入此文件类型"));
  }
  if (!String(markdown || "").trim()) throw new Error(tr("文件中没有可导入的内容"));
  const note = await vault.create(notePath, String(markdown).trim() + "\n");
  await openImportedNote(plugin, note);
  return notePath;
}

function normalizeMarkdownImportName(value: string) {
  const name = String(value || "").trim().replace(/\.md$/i, "");
  if (!name || hasInvalidNameChar(name) || name === "." || name === "..") {
    throw new Error(tr("Markdown 文件名无效"));
  }
  return name;
}

async function importNotionZipAsMarkdown(plugin: IgnorancePlugin, file: TFile, folderName: string) {
  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const importRoot = [parentPath, normalizeMarkdownImportName(folderName)].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(importRoot)) throw new Error(tr("目标文件夹已存在：") + importRoot);
  const archive = await notionZipToMarkdown(await vault.readBinary(file), importRoot);
  const plannedPaths = [...archive.files.map(item => item.path), ...archive.assets.map(item => item.path)];
  const normalized = new Set<string>();
  const plannedFiles = new Set(plannedPaths.map(target => target.toLowerCase()));
  for (const target of plannedPaths) {
    const key = target.toLowerCase();
    if (normalized.has(key)) throw new Error(tr("Notion 导出包中存在重名目标：") + target);
    normalized.add(key);
    if (vault.getAbstractFileByPath(target)) throw new Error(tr("目标文件已存在：") + target);
    for (let parent = parentFolder(target); parent; parent = parentFolder(parent)) {
      if (plannedFiles.has(parent.toLowerCase())) throw new Error(tr("Notion 导出包中的文件与目录路径冲突：") + parent);
    }
  }

  const createdFiles: TFile[] = [];
  const createdFolders: TFolder[] = [];
  try {
    const preparedAssets: Array<{ asset: (typeof archive.assets)[number]; bytes: ArrayBuffer }> = [];
    for (const asset of archive.assets) {
      preparedAssets.push({ asset, bytes: await convertImageToWebp(asset.bytes, asset.path) });
    }

    await createMissingVaultFolders(vault, plannedPaths, createdFolders);
    for (const { asset, bytes } of preparedAssets) {
      createdFiles.push(await vault.createBinary(asset.path, bytes));
    }
    for (const document of archive.files) {
      createdFiles.push(await vault.create(document.path, document.content.trim() + "\n"));
    }
    const firstNote = createdFiles.find(created => String(created.extension).toLowerCase() === "md");
    if (firstNote) await openImportedNote(plugin, firstNote);
    return tr("{root}（{notes} 篇笔记，{n} 张 WebP 图片）", { root: archive.root, notes: archive.files.length, n: preparedAssets.length });
  } catch (error) {
    const rollbackFailures = await rollbackImportedFiles(plugin, createdFiles, createdFolders);
    if (rollbackFailures.length) {
      throw new Error(tr("{error}；部分导入文件未能移入废纸篓：{files}", { error: errorText(error), files: rollbackFailures.join("、") }));
    }
    throw error;
  }
}

function parentFolder(path: string) {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

// Any picture the browser can decode, re-encoded as WebP.
async function convertImageToWebp(bytes: Uint8Array, name: string): Promise<ArrayBuffer> {
  let bitmap: ImageBitmap | undefined;
  try {
    const type = /\.svg$/i.test(name) ? "image/svg+xml" : "";
    bitmap = await createImageBitmap(new Blob([bytes], type ? { type } : {}));
    const canvas = createEl("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error(tr("无法解码图片"));
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error(tr("当前 Obsidian 不支持 WebP 编码"));
    return await blob.arrayBuffer();
  } catch (error) {
    throw new Error(tr("{file} 转 WebP 失败：{error}", { file: name.split("/").pop() ?? name, error: errorText(error) }));
  } finally {
    bitmap?.close();
  }
}

function safeAssetStem(name: string) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "word-import";
}

async function importDocxAsMarkdown(plugin: IgnorancePlugin, file: TFile, noteName: string) {
  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const notePath = [parentPath, noteName + ".md"].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(notePath)) throw new Error(tr("目标笔记已存在：") + notePath);
  const assetDir = [parentPath, "assets"].filter(Boolean).join("/");
  const assetFolder = vault.getAbstractFileByPath(assetDir);
  if (assetFolder && !folderChildren(assetFolder)) throw new Error(tr("assets 路径已被同名文件占用：") + assetDir);

  const placeholder = "ib-docx-media:";
  const docx = await docxToMarkdown(new Uint8Array(await vault.readBinary(file)), placeholder);
  const converted = docx.markdown;
  const images = docx.images;
  if (!converted.trim() && !images.length) throw new Error(tr("文件中没有可导入的内容"));
  const stem = safeAssetStem(noteName);
  const pending: Array<{ path: string; bytes: ArrayBuffer }> = [];
  const links = new Map<string, string>();
  for (const [index, image] of images.entries()) {
    const base = stem + "-" + String(index + 1).padStart(2, "0");
    let assetName = base + ".webp";
    for (let suffix = 2; vault.getAbstractFileByPath(assetDir + "/" + assetName); suffix += 1) assetName = base + "-" + suffix + ".webp";
    // Word's EMF / WMF drawings cannot be decoded in the page; leave them out.
    let bytes: ArrayBuffer;
    try { bytes = await convertImageToWebp(image.bytes, image.name); } catch { continue; }
    pending.push({ path: assetDir + "/" + assetName, bytes });
    links.set(image.name, "./assets/" + assetName);
  }
  const markdown = converted.replace(/!\[\]\(ib-docx-media:([^)]+)\)/g, (_whole, name: string) => links.has(name) ? `![](${links.get(name)})` : "");

  const createdFiles: TFile[] = [];
  try {
    if (pending.length && !assetFolder) await vault.createFolder(assetDir);
    for (const asset of pending) createdFiles.push(await vault.createBinary(asset.path, asset.bytes));
    const note = await vault.create(notePath, markdown.trim() + "\n");
    createdFiles.push(note);
    await openImportedNote(plugin, note);
    return pending.length ? tr("{path}（含 {n} 张 WebP 图片）", { path: notePath, n: pending.length }) : notePath;
  } catch (error) {
    for (const created of createdFiles.reverse()) {
      try { await plugin.app.fileManager.trashFile(created); } catch { /* best effort */ }
    }
    throw error;
  }
}


export {
  HTML_READONLY_VIEW,
  fileToolsDefaults,
  isPastedImageFile,
  pastedImageFiles,
  imageTransferRange,
  imageTransferSequence,
  handleImageTransfer,
  replacePendingImageMarker,
  encodePastedImage,
  nextPastedImageSequence,
  trashPastedImageFiles,
  savePastedImages,
  addFileToolsMenu,
  runFileTool,
  escapeHtmlAttribute,
  htmlReaderDocument,
  HtmlReadOnlyView,
  MarkdownImportModal,
  convertImageToWebp,
  safeAssetStem,
  importDocxAsMarkdown,
  isMarkdownImportSource,
  importVaultFileAsMarkdown
};
