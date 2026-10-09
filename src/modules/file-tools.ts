import { materializeConverters } from "./assets.js";
import { findPandoc } from "./export.js";
const { Notice, Setting, Platform, Menu, FileView, Modal } = require("obsidian");

const HTML_READONLY_VIEW = "ignorance-html-readonly";
const MARKDOWN_IMPORT_EXTS = new Set(["docx", "pdf", "xlsx", "pptx", "csv", "tsv", "json", "html", "htm", "zip"]);

async function loadImportConverters(plugin) {
  return require(await loadImportConvertersPath(plugin));
}

async function loadImportConvertersPath(plugin) {
  return materializeConverters(plugin);
}

function fileToolsDefaults() {
  return { apps: [], convertPastedImages: true };
}

function isPastedImageFile(file) {
  if (!file || typeof file.size !== "number" || file.size <= 0) return false;
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "");
  return type.startsWith("image/") || /\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i.test(name);
}

function pastedImageFiles(event) {
  const transfer = event.clipboardData || event.dataTransfer;
  if (!transfer) return [];
  const files = [];
  for (const item of Array.from(transfer.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (isPastedImageFile(file)) files.push(file);
  }
  if (files.length) return files;
  return Array.from(transfer.files || []).filter(isPastedImageFile);
}

function imageTransferRange(event, editor, kind) {
  if (kind !== "drop") return { from: editor.getCursor("from"), to: editor.getCursor("to") };
  const cm = editor.cm;
  if (!cm || typeof cm.posAtCoords !== "function") return null;
  const offset = cm.posAtCoords({ x: event.clientX, y: event.clientY });
  if (typeof offset !== "number") return null;
  const position = editor.offsetToPos(offset);
  return { from: position, to: position };
}

let imageTransferSequence = 0;

function handleImageTransfer(plugin, event, editor, info, kind) {
  if (event.defaultPrevented || !plugin.state.fileTools?.convertPastedImages) return;
  const files = pastedImageFiles(event);
  const file = info?.file;
  if (!files.length || !file || typeof file.path !== "string" || String(file.extension).toLowerCase() !== "md") return;

  const range = imageTransferRange(event, editor, kind);
  if (!range) return;
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++imageTransferSequence}`;
  const marker = `<!-- ignorance-advanced-image-${randomId} -->`;
  const originalText = editor.getRange(range.from, range.to);
  try {
    event.preventDefault();
    editor.replaceRange(marker, range.from, range.to);
  } catch (error) {
    console.error("Ignorance Advanced: 图片粘贴插入点创建失败 —", error);
    new Notice("图片未能插入编辑器：" + (error.message || error), 8000);
    return;
  }

  void savePastedImages(plugin, file, files, editor, marker).then(result => {
    if (!replacePendingImageMarker(editor, marker, result.markdown)) {
      return trashPastedImageFiles(plugin, result.createdFiles, result.createdFolder).then(() => {
        new Notice("图片已取消插入，已清理本次生成的附件。", 6000);
      });
    }
    new Notice(`已保存 ${result.createdFiles.length} 张图片到同级 assets/。`);
  }).catch(error => {
    replacePendingImageMarker(editor, marker, originalText);
    console.error("Ignorance Advanced: 图片粘贴转换失败 —", error);
    new Notice("图片处理失败：" + (error.message || error), 8000);
  });
}

function replacePendingImageMarker(editor, marker, replacement) {
  try {
    const content = editor.getValue();
    const start = content.indexOf(marker);
    if (start < 0 || content.indexOf(marker, start + marker.length) !== -1) return false;
    editor.replaceRange(replacement, editor.offsetToPos(start), editor.offsetToPos(start + marker.length));
    return true;
  } catch (_) {
    return false;
  }
}

async function encodePastedImage(file) {
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

  if (typeof createImageBitmap !== "function") throw new Error("当前设备无法解码粘贴的图片");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("图片尺寸无效或无法绘制");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("WebP 编码失败")), "image/webp", 0.85);
    });
    if (blob.type !== "image/webp") throw new Error("当前设备不支持 WebP 编码");
    return { extension: "webp", bytes: new Uint8Array(await blob.arrayBuffer()) };
  } finally {
    bitmap?.close?.();
  }
}

function nextPastedImageSequence(vault, assetDir, stem) {
  const folder = vault.getAbstractFileByPath(assetDir);
  if (!folder || !Array.isArray(folder.children)) return 1;
  const prefix = stem + "-";
  let maximum = 0;
  for (const child of folder.children) {
    if (!child.name.startsWith(prefix)) continue;
    const match = child.name.slice(prefix.length).match(/^(\d+)(?:\.[^.]+)?$/);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum + 1;
}

async function trashPastedImageFiles(plugin, files, folder) {
  for (const file of [...(files || [])].reverse()) {
    try { await plugin.app.fileManager.trashFile(file); } catch (_) {}
  }
  if (folder && Array.isArray(folder.children) && folder.children.length === 0) {
    try { await plugin.app.fileManager.trashFile(folder); } catch (_) {}
  }
}

async function savePastedImages(plugin, note, files, editor, marker) {
  const vault = plugin.app.vault;
  const parentPath = note.parent?.path || "";
  const assetDir = [parentPath, "assets"].filter(Boolean).join("/");
  const existingFolder = vault.getAbstractFileByPath(assetDir);
  if (existingFolder && !Array.isArray(existingFolder.children)) throw new Error("assets 路径已被同名文件占用：" + assetDir);
  const stem = safeAssetStem(note.basename || "image");
  let sequence = nextPastedImageSequence(vault, assetDir, stem);
  let createdFolder = null;
  const createdFiles = [];
  const markdown = [];

  try {
    for (const file of files) {
      const encoded = await encodePastedImage(file);
      if (!editor.getValue().includes(marker)) throw new Error("编辑位置已取消，未保存图片");

      if (!vault.getAbstractFileByPath(assetDir)) {
        try {
          createdFolder = await vault.createFolder(assetDir);
        } catch (error) {
          const racedFolder = vault.getAbstractFileByPath(assetDir);
          if (!racedFolder || !Array.isArray(racedFolder.children)) throw error;
        }
      }

      let savedFile;
      let assetName;
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

function addFileToolsMenu(plugin, menu, file) {
  if (!file || typeof file.path !== "string" || !file.extension) return;
  if (!Platform.isMobile) {
    if (Platform.isMacOS) {
      for (const appName of plugin.state.fileTools?.apps || []) {
        const app = String(appName).trim();
        if (!app || /[\r\n\0]/.test(app)) continue;
        menu.addItem(item => item
          .setTitle("用 " + app + " 打开")
          .setIcon("lucide-app-window")
          .onClick(() => runFileTool("打开文件", () => openWithNamedApp(plugin, file, app))));
      }
    }
  }
  if (isMarkdownImportSource(file)) {
    menu.addSeparator();
    menu.addItem(item => item
      .setTitle("导入为 Markdown")
      .setIcon("lucide-file-down")
      .onClick(() => new MarkdownImportModal(plugin, file).open()));
  }
}

function isMarkdownImportSource(file) {
  const extension = String(file?.extension || "").toLowerCase();
  return !Platform.isMobile && MARKDOWN_IMPORT_EXTS.has(extension);
}

async function runFileTool(label, task) {
  try {
    const result = await task();
    if (result) new Notice(label + "：" + result, 6000);
  } catch (error) {
    console.error("Ignorance Advanced: " + label + "失败 —", error);
    new Notice(label + "失败：" + (error.message || error), 8000);
  }
}

function fullVaultPath(plugin, file) {
  const fullPath = plugin.app.vault.adapter.getFullPath(file.path);
  if (!fullPath) throw new Error("无法取得文件的系统路径");
  return fullPath;
}

function openWithNamedApp(plugin, file, appName) {
  return new Promise((resolve, reject) => {
    require("child_process").execFile(
      "open",
      ["-a", appName, fullVaultPath(plugin, file)],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      error => error ? reject(error) : resolve(null)
    );
  });
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function htmlReaderDocument(source, baseHref) {
  const security = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri app:; img-src app: data: blob: https: http:; style-src \'unsafe-inline\' app: data: https: http:; font-src app: data: https: http:; media-src app: data: blob: https: http:">';
  const head = '<base href="' + escapeHtmlAttribute(baseHref) + '">' + security;
  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b[^>]*>/i, match => match + head);
  }
  if (/<html\b[^>]*>/i.test(source)) {
    return source.replace(/<html\b[^>]*>/i, match => match + "<head>" + head + "</head>");
  }
  return "<!doctype html><html><head>" + head + "</head><body>" + source + "</body></html>";
}

class HtmlReadOnlyView extends FileView {
  constructor(leaf) {
    super(leaf);
    this.renderToken = 0;
  }

  getViewType() { return HTML_READONLY_VIEW; }
  getDisplayText() { return this.file?.basename || "HTML"; }
  getIcon() { return "lucide-code-xml"; }
  canAcceptExtension(extension) { return ["html", "htm"].includes(String(extension).toLowerCase()); }

  onload() {
    super.onload();
    this.contentEl.addClass("ibm-html-reader-view");
  }

  async onLoadFile(file) {
    const token = ++this.renderToken;
    this.contentEl.empty();
    const iframe = this.contentEl.createEl("iframe", {
      cls: "ibm-html-reader-frame",
      attr: { title: file.basename + "（只读 HTML 预览）", sandbox: "" }
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
      this.contentEl.createDiv({ cls: "ibm-html-reader-error", text: "HTML 预览失败：" + (error.message || error) });
    }
  }

  async onUnloadFile(file) {
    this.renderToken += 1;
    this.contentEl.empty();
    return super.onUnloadFile(file);
  }
}

class MarkdownImportModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.noteName = file.basename;
  }

  onOpen() {
    const extension = String(this.file.extension || "").toLowerCase();
    this.titleEl.setText("导入为 Markdown");
    const { contentEl } = this;
    contentEl.empty();
    const description = extension === "docx"
      ? "Pandoc 在本机转换 Word 文档；提取的图片会转为 WebP 并放进目标笔记同级的 assets/。"
      : extension === "zip"
        ? "按 Notion 导出包导入 Markdown 页面、CSV 表格和图片；页面目录与内链会保留，图片转为 WebP。"
        : "本地转换为 Markdown；生成的笔记与源文件放在同一目录。PDF 扫描件暂不做 OCR。";
    contentEl.createEl("p", { text: description });
    new Setting(contentEl).setName(extension === "zip" ? "Notion 导入文件夹" : "Markdown 文件名").setDesc("可改成语义化名称；不会覆盖已有文件。")
      .addText(text => text.setValue(this.noteName).onChange(value => { this.noteName = value; }));
    new Setting(contentEl).addButton(button => button
      .setButtonText("取消")
      .onClick(() => this.close()))
      .addButton(button => button
        .setButtonText("开始导入")
        .setCta()
        .onClick(async () => {
          const noteName = this.noteName.trim().replace(/\.md$/i, "");
          if (!noteName || /[\\/:*?"<>|\u0000-\u001f]/.test(noteName) || noteName === "." || noteName === "..") {
            new Notice("请填写有效的 Markdown 文件名");
            return;
          }
          this.close();
          await runFileTool("导入 Markdown", () => importVaultFileAsMarkdown(this.plugin, this.file, noteName));
        }));
  }
}

async function createMissingVaultFolders(vault, targetPaths, created = []) {
  const folders = new Set();
  for (const target of targetPaths) {
    const segments = String(target).split("/").filter(Boolean);
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) folders.add(segments.slice(0, index).join("/"));
  }
  for (const folderPath of [...folders].sort((a, b) => a.split("/").length - b.split("/").length)) {
    const existing = vault.getAbstractFileByPath(folderPath);
    if (existing) {
      if (!Array.isArray(existing.children)) throw new Error("目標目錄被同名文件占用：" + folderPath);
      continue;
    }
    try {
      created.push(await vault.createFolder(folderPath));
    } catch (error) {
      const racedFolder = vault.getAbstractFileByPath(folderPath);
      if (!racedFolder || !Array.isArray(racedFolder.children)) throw error;
    }
  }
  return created;
}

async function rollbackImportedFiles(plugin, files, folders = []) {
  const failures = [];
  for (const file of [...files].reverse()) {
    try { await plugin.app.fileManager.trashFile(file); } catch (_) { failures.push(file.path); }
  }
  for (const folder of [...folders].reverse()) {
    try {
      if (Array.isArray(folder.children) && folder.children.length === 0) await plugin.app.fileManager.trashFile(folder);
    } catch (_) { failures.push(folder.path); }
  }
  return failures;
}

async function openImportedNote(plugin, note) {
  try {
    await plugin.app.workspace.getLeaf(false).openFile(note);
  } catch (error) {
    new Notice("已导入 " + note.path + "，但未能自动打开：" + (error.message || error), 8000);
  }
}

async function importVaultFileAsMarkdown(plugin, file, noteName) {
  if (!isMarkdownImportSource(file)) throw new Error("不支持导入此文件类型");
  const extension = String(file.extension).toLowerCase();
  const normalizedName = normalizeMarkdownImportName(noteName);
  if (extension === "docx") return importDocxAsMarkdown(plugin, file, normalizedName);
  if (extension === "zip") return importNotionZipAsMarkdown(plugin, file, normalizedName);

  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const notePath = [parentPath, normalizedName + ".md"].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(notePath)) throw new Error("目标笔记已存在：" + notePath);

  const converters = await loadImportConverters(plugin);
  const text = () => vault.cachedRead(file);
  const bytes = () => vault.readBinary(file);
  let markdown;
  switch (extension) {
    case "csv": markdown = converters.csvToMarkdown(await text(), ","); break;
    case "tsv": markdown = converters.csvToMarkdown(await text(), "\t"); break;
    case "json": markdown = converters.jsonToMarkdown(await text()); break;
    case "html":
    case "htm": markdown = await converters.htmlToMarkdown(await text()); break;
    case "xlsx": markdown = await converters.xlsxToMarkdown(new Uint8Array(await bytes())); break;
    case "pptx": markdown = await converters.pptxToMarkdown(new Uint8Array(await bytes())); break;
    case "pdf": markdown = await converters.pdfToMarkdown(new Uint8Array(await bytes())); break;
    default: throw new Error("不支持导入此文件类型");
  }
  if (!String(markdown || "").trim()) throw new Error("文件中没有可导入的内容");
  const note = await vault.create(notePath, String(markdown).trim() + "\n");
  await openImportedNote(plugin, note);
  return notePath;
}

function normalizeMarkdownImportName(value) {
  const name = String(value || "").trim().replace(/\.md$/i, "");
  if (!name || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || name === "." || name === "..") {
    throw new Error("Markdown 文件名无效");
  }
  return name;
}

async function importNotionZipAsMarkdown(plugin, file, folderName) {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const importRoot = [parentPath, normalizeMarkdownImportName(folderName)].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(importRoot)) throw new Error("目标文件夹已存在：" + importRoot);
  const converters = await loadImportConverters(plugin);
  const archive = await converters.notionZipToMarkdown(await vault.readBinary(file), importRoot);
  const plannedPaths = [...archive.files.map(item => item.path), ...archive.assets.map(item => item.path)];
  const normalized = new Set();
  const plannedFiles = new Set(plannedPaths.map(target => target.toLowerCase()));
  for (const target of plannedPaths) {
    const key = target.toLowerCase();
    if (normalized.has(key)) throw new Error("Notion 导出包中存在重名目标：" + target);
    normalized.add(key);
    if (vault.getAbstractFileByPath(target)) throw new Error("目标文件已存在：" + target);
    let parent = path.posix.dirname(target);
    while (parent !== ".") {
      if (plannedFiles.has(parent.toLowerCase())) throw new Error("Notion 导出包中的文件与目录路径冲突：" + parent);
      parent = path.posix.dirname(parent);
    }
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignorance-notion-import-"));
  const createdFiles = [];
  const createdFolders = [];
  try {
    const cwebp = findCwebp();
    const preparedAssets = [];
    for (let index = 0; index < archive.assets.length; index += 1) {
      const asset = archive.assets[index];
      const source = path.join(tempRoot, `source-${index + 1}.${asset.extension || "img"}`);
      const destination = path.join(tempRoot, `image-${index + 1}.webp`);
      fs.writeFileSync(source, Buffer.from(asset.bytes));
      await convertImageToWebp(source, destination, cwebp);
      preparedAssets.push({ asset, bytes: fs.readFileSync(destination) });
    }

    await createMissingVaultFolders(vault, plannedPaths, createdFolders);
    for (const { asset, bytes } of preparedAssets) {
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      createdFiles.push(await vault.createBinary(asset.path, arrayBuffer));
    }
    for (const document of archive.files) {
      createdFiles.push(await vault.create(document.path, document.content.trim() + "\n"));
    }
    const firstNote = createdFiles.find(created => String(created.extension).toLowerCase() === "md");
    if (firstNote) await openImportedNote(plugin, firstNote);
    return `${archive.root}（${archive.files.length} 篇笔记，${preparedAssets.length} 张 WebP 图片）`;
  } catch (error) {
    const rollbackFailures = await rollbackImportedFiles(plugin, createdFiles, createdFolders);
    if (rollbackFailures.length) {
      throw new Error((error.message || error) + "；部分导入文件未能移入废纸篓：" + rollbackFailures.join("、"));
    }
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function findCwebp() {
  const fs = require("fs");
  return ["/opt/homebrew/bin/cwebp", "/usr/local/bin/cwebp", "/usr/bin/cwebp"]
    .find(candidate => fs.existsSync(candidate)) || null;
}

async function convertImageToWebp(source, destination, cwebp) {
  const fs = require("fs");
  if (cwebp) {
    try {
      await execFileAsync(cwebp, ["-quiet", "-q", "85", source, "-o", destination], {
        timeout: 120000, maxBuffer: 4 * 1024 * 1024
      });
      return;
    } catch (_) {
      // Browser decoding below also covers SVG and other formats cwebp cannot read.
    }
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([fs.readFileSync(source)]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("无法解码图片");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error("当前 Obsidian 不支持 WebP 编码");
    fs.writeFileSync(destination, Buffer.from(await blob.arrayBuffer()));
  } catch (error) {
    throw new Error(pathBasename(source) + " 转 WebP 失败：" + (error.message || error));
  } finally {
    bitmap?.close?.();
  }
}

function pathBasename(filePath) {
  return require("path").basename(filePath);
}

function execFileAsync(binary, args, options) {
  return new Promise((resolve, reject) => {
    require("child_process").execFile(binary, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
  });
}

function collectFiles(directory, root = directory) {
  const fs = require("fs");
  const path = require("path");
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(candidate, root));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

function decodeHtmlEntities(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function mediaKey(relativePath) {
  const path = require("path");
  let decoded = decodeHtmlEntities(String(relativePath).replace(/\\/g, "/"));
  try { decoded = decodeURIComponent(decoded); } catch (_) {}
  decoded = decoded.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(decoded)) return null;
  return path.posix.normalize(decoded).toLowerCase();
}

function rewriteImportedMedia(markdown, replacements) {
  let count = 0;
  const resolve = rawPath => {
    const key = mediaKey(rawPath.replace(/^<|>$/g, ""));
    const result = key ? replacements.get(key) : null;
    if (result) count += 1;
    return result;
  };
  markdown = markdown.replace(/<img\b[^>]*>/gi, tag => tag.replace(/\bsrc\s*=\s*(["'])(.*?)\1/i, (whole, quote, src) => {
    const next = resolve(src);
    return next ? 'src="' + next + '"' : whole;
  }));
  markdown = markdown.replace(/(!\[[^\]]*\]\()\s*(<[^>]+>|[^)\s]+)(\))/g, (whole, prefix, destination, suffix) => {
    const next = resolve(destination);
    return next ? prefix + next + suffix : whole;
  });
  return { markdown, count };
}

function safeAssetStem(name) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "word-import";
}

async function importDocxAsMarkdown(plugin, file, noteName) {
  const pandoc = findPandoc();
  const cwebp = findCwebp();
  if (!pandoc) throw new Error("未找到 Pandoc，请先安装（brew install pandoc）");

  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const vault = plugin.app.vault;
  const parentPath = file.parent?.path || "";
  const normalizedName = noteName.trim().replace(/\.md$/i, "");
  if (!normalizedName || /[\\/\u0000-\u001f]/.test(normalizedName)) throw new Error("Markdown 文件名无效");
  const notePath = [parentPath, normalizedName + ".md"].filter(Boolean).join("/");
  if (vault.getAbstractFileByPath(notePath)) throw new Error("目标笔记已存在：" + notePath);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignorance-word-import-"));
  const mediaDir = path.join(tempRoot, "media");
  const outputPath = path.join(tempRoot, "import.md");
  const createdFiles = [];
  try {
    const inputPath = vault.adapter.getFullPath(file.path);
    await execFileAsync(pandoc, [
      inputPath, "-f", "docx", "-t", "gfm", "--extract-media=media", "-o", "import.md"
    ], { cwd: tempRoot, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });

    let markdown = fs.readFileSync(outputPath, "utf8");
    const extracted = fs.existsSync(mediaDir) ? collectFiles(mediaDir) : [];
    const images = extracted.filter(source => /\.(?:png|jpe?g|gif|bmp|tiff?|webp|svg|emf|wmf|avif|heic)$/i.test(source));
    const assetDir = [parentPath, "assets"].filter(Boolean).join("/");
    const assetFolder = vault.getAbstractFileByPath(assetDir);
    if (assetFolder && !Array.isArray(assetFolder.children)) throw new Error("assets 路径已被同名文件占用：" + assetDir);

    const replacements = new Map();
    const pendingAssets = [];
    const stem = safeAssetStem(normalizedName);
    for (let index = 0; index < images.length; index += 1) {
      const source = images[index];
      const relativeSource = path.relative(tempRoot, source).split(path.sep).join("/");
      const base = stem + "-" + String(index + 1).padStart(2, "0");
      let assetName = base + ".webp";
      let suffix = 2;
      while (vault.getAbstractFileByPath(assetDir + "/" + assetName)) {
        assetName = base + "-" + suffix++ + ".webp";
      }
      const tempWebp = path.join(tempRoot, "converted-" + String(index + 1).padStart(3, "0") + ".webp");
      await convertImageToWebp(source, tempWebp, cwebp);
      const link = "./assets/" + assetName;
      replacements.set(relativeSource.toLowerCase(), link);
      pendingAssets.push({ tempWebp, path: assetDir + "/" + assetName });
    }

    const rewritten = rewriteImportedMedia(markdown, replacements);
    if (images.length && rewritten.count === 0) {
      throw new Error("Pandoc 已提取图片，但无法对应 Markdown 中的图片引用；未写入目标文件。");
    }
    markdown = rewritten.markdown;

    if (pendingAssets.length && !assetFolder) await vault.createFolder(assetDir);
    for (const asset of pendingAssets) {
      const bytes = fs.readFileSync(asset.tempWebp);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      createdFiles.push(await vault.createBinary(asset.path, arrayBuffer));
    }
    const note = await vault.create(notePath, markdown);
    createdFiles.push(note);
    const leaf = plugin.app.workspace.getLeaf(false);
    await leaf.openFile(note);
    return notePath + (pendingAssets.length ? "（含 " + pendingAssets.length + " 张 WebP 图片）" : "");
  } catch (error) {
    for (const created of createdFiles.reverse()) {
      try { await plugin.app.fileManager.trashFile(created); } catch (_) {}
    }
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
  fullVaultPath,
  openWithNamedApp,
  escapeHtmlAttribute,
  htmlReaderDocument,
  HtmlReadOnlyView,
  MarkdownImportModal,
  findCwebp,
  convertImageToWebp,
  pathBasename,
  execFileAsync,
  collectFiles,
  decodeHtmlEntities,
  mediaKey,
  rewriteImportedMedia,
  safeAssetStem,
  importDocxAsMarkdown,
  isMarkdownImportSource,
  importVaultFileAsMarkdown
};
