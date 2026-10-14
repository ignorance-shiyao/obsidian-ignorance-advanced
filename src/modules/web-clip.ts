import type { IgnorancePlugin } from "../plugin-types.js";
import { Modal, Notice, Setting, TFile, htmlToMarkdown, normalizePath, requestUrl } from "obsidian";
import { setIcon } from "./ui-icons.js";
/* Clip a web page into the clipping folder the way the Web Clipper template does:
   title / source / author / published / created / description / tags, the
   article body as Markdown, images saved to <folder>/assets/ (WebP, named like
   pasted images). Works on mobile: requestUrl has no CORS limits.
   Entry points:
     - 剪藏网页 command (link box, prefilled from the clipboard)
     - pasting a lone link into an empty note clips into that note
     - a note arriving from the share sheet whose clip failed (WeChat answers
       Obsidian's own fetch with a verification page) is clipped again in place
     - 重新剪藏当前笔记 for any note with a source link */
import { encodePastedImage, safeAssetStem, nextPastedImageSequence } from "./file-tools.js";
import { URL_PATTERN, day, frontmatter, isClipUrl, pad, tidyMarkdown } from "./web-clip-format.js";


export const CLIP_FOLDER = "Clippings";

/** The folder chosen in settings (default "Clippings"); its last segment is also the note tag. */
export function clipFolder(plugin: IgnorancePlugin) {
  const value = String(plugin.state.webClip?.folder || "").trim().replace(/^\/+|\/+$/g, "");
  return value || CLIP_FOLDER;
}
// A desktop browser: WeChat serves bots and unknown clients a verification page.
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FAILED_CLIP = /环境异常|完成验证后即可继续访问|轻点两下取消赞/;


function isWeChat(url) { return /^https?:\/\/mp\.weixin\.qq\.com\//.test(url); }

function meta(doc, ...names) {
  for (const name of names) {
    const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    const value = el?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return "";
}

function scriptVar(html, name: string) {
  const match = html.match(new RegExp(`var ${name}\\s*=\\s*(?:htmlDecode\\()?["']([^"']*)["']`));
  return match ? match[1] : "";
}

function toDate(value) {
  if (!value) return "";
  const date = /^\d{9,11}$/.test(value) ? new Date(Number(value) * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : day(date);
}

/* --- site adapters: { title, author, published, description, body } -------- */

function wechat(doc, html) {
  const body = doc.querySelector("#js_content");
  if (!body) return null;
  body.removeAttribute("style");
  // Images are lazy: the real address is in data-src.
  body.querySelectorAll("img").forEach(img => {
    const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
    img.setAttribute("src", src.replace(/^\/\//, "https://"));
  });
  // Decorative empty sections and the "写留言" style widgets carry no text.
  body.querySelectorAll("mp-style-type, script, style, .js_uneditable, mpvoice, mpprofile").forEach((el: HTMLElement) => el.remove());
  return {
    title: meta(doc, "og:title") || scriptVar(html, "msg_title"),
    author: meta(doc, "og:article:author", "author") || scriptVar(html, "nickname"),
    published: toDate(html.match(/ori_create_time\s*[:=]\s*["']?(\d{9,11})/)?.[1] || scriptVar(html, "create_time")),
    description: meta(doc, "og:description", "description") || scriptVar(html, "msg_desc"),
    body
  };
}

// Largest text block, when the page has no <article>.
function mainBlock(doc) {
  const direct = doc.querySelector("article, [itemprop='articleBody'], main, .post-content, .article-content, .entry-content, .RichText");
  if (direct) return direct;
  let best = doc.body, score = 0;
  doc.querySelectorAll("div, section").forEach((el: HTMLElement) => {
    const text = el.textContent?.length || 0;
    const paragraphs = el.querySelectorAll(":scope > p").length;
    const value = paragraphs * 200 + text / 10;
    if (value > score) { score = value; best = el; }
  });
  return best;
}

function generic(doc) {
  const body = mainBlock(doc);
  body.querySelectorAll("script, style, noscript, nav, header, footer, aside, form, iframe, button").forEach((el: HTMLElement) => el.remove());
  body.querySelectorAll("img").forEach(img => {
    const src = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("src") || "";
    if (src) img.setAttribute("src", src);
  });
  return {
    title: meta(doc, "og:title", "twitter:title") || doc.title || "",
    author: meta(doc, "author", "article:author", "og:article:author"),
    published: toDate(meta(doc, "article:published_time", "og:article:published_time", "publishdate", "date")),
    description: meta(doc, "og:description", "description", "twitter:description"),
    body
  };
}

/* --- page → note ------------------------------------------------------------ */

async function fetchArticle(url) {
  const response = await requestUrl({ url, headers: { "User-Agent": BROWSER_UA, "Accept-Language": "zh-CN,zh;q=0.9" }, throw: false });
  if (response.status >= 400) throw new Error(`网页返回 ${response.status}`);
  const html = response.text;
  if (FAILED_CLIP.test(html) && !/id="js_content"/.test(html)) throw new Error("网站要求验证，暂时无法抓取");
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Relative links and images resolve against the page.
  const base = doc.createElement("base");
  base.href = response.headers?.["location"] || url;
  doc.head.prepend(base);
  const article = (isWeChat(url) && wechat(doc, html)) || generic(doc);
  if (!article.body || !article.body.textContent.trim()) throw new Error("没有找到正文");
  article.body.querySelectorAll("img[src]").forEach(img => { img.setAttribute("src", new URL(img.getAttribute("src"), base.href).href); });
  article.body.querySelectorAll("a[href]").forEach(a => { try { a.setAttribute("href", new URL(a.getAttribute("href"), base.href).href); } catch (_) {} });
  return article;
}

// Download every image into <folder>/assets/, rewrite the <img> to point there.
async function saveImages(plugin: IgnorancePlugin, body, folder, stem, progress) {
  const vault = plugin.app.vault;
  const assetDir = normalizePath([folder, "assets"].filter(Boolean).join("/"));
  const images = [...body.querySelectorAll("img[src]")].filter(img => /^https?:/.test(img.getAttribute("src")));
  let sequence = nextPastedImageSequence(vault, assetDir, stem);
  for (const [index, img] of images.entries()) {
    progress?.(index + 1, images.length);
    try {
      const response = await requestUrl({ url: img.getAttribute("src"), headers: { "User-Agent": BROWSER_UA } });
      const type = response.headers?.["content-type"] || "image/jpeg";
      const encoded = await encodePastedImage(new Blob([response.arrayBuffer], { type }));
      if (!vault.getAbstractFileByPath(assetDir)) await vault.createFolder(assetDir).catch(() => {});
      let name;
      do { name = `${stem}-${pad(sequence)}.${encoded.extension}`; sequence += 1; } while (vault.getAbstractFileByPath(`${assetDir}/${name}`));
      await vault.createBinary(`${assetDir}/${name}`, encoded.bytes.buffer.slice(encoded.bytes.byteOffset, encoded.bytes.byteOffset + encoded.bytes.byteLength));
      img.setAttribute("src", `./assets/${name}`); // stems are space-free (safeAssetStem)
      img.setAttribute("alt", img.getAttribute("alt") || name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      // Keep the remote address; the note is still usable.
      console.warn("Ignorance Advanced: clip image failed —", img.getAttribute("src"), error);
    }
  }
}

function safeNoteName(title) {
  return String(title || "未命名剪藏").replace(/[\\/:*?"<>|#^[\]]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "未命名剪藏";
}

function uniquePath(vault, folder, name: string, except) {
  let path = normalizePath(`${folder}/${name}.md`);
  for (let index = 1; vault.getAbstractFileByPath(path) && vault.getAbstractFileByPath(path) !== except; index += 1) path = normalizePath(`${folder}/${name} ${index}.md`);
  return path;
}

/* Clip `url`; into `target` (an existing note, renamed after the article) or a
   new note in the clipping folder. Returns the note. */
/** Sub-folder named after the site, for "sort clippings by site". */
export function siteFolder(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").replace(/[\\/:*?"<>|]/g, "-"); } catch (_) { return ""; }
}

export async function clipUrl(plugin: IgnorancePlugin, url, target: HTMLElement = null) {
  const vault = plugin.app.vault;
  const notice = new Notice("正在剪藏…", 0);
  try {
    const article = await fetchArticle(url);
    const title = article.title || url;
    const name = safeNoteName(title);
    const base = clipFolder(plugin);
    const inPlace = Boolean(target?.parent?.path && target.parent.path !== "/");
    const site = !inPlace && plugin.state.webClip?.byDomain ? siteFolder(url) : "";
    const folder = inPlace ? target.parent.path : site ? `${base}/${site}` : base;
    for (const path of [base, folder]) if (!vault.getAbstractFileByPath(path)) await vault.createFolder(path).catch(() => {});
    await saveImages(plugin, article.body, folder, safeAssetStem(name), (i: number, n) => notice.setMessage(`正在剪藏：保存图片 ${i} / ${n}`));
    const markdown = tidyMarkdown(htmlToMarkdown(article.body.innerHTML));
    const text = `${frontmatter({ ...article, title, url, tag: (inPlace ? folder : base).split("/").pop() })}${markdown}\n`;
    let note = target;
    if (note) {
      await vault.process(note, () => text);
      const wanted = uniquePath(vault, folder, name, note);
      if (wanted !== note.path) await plugin.app.fileManager.renameFile(note, wanted);
    } else {
      note = await vault.create(uniquePath(vault, folder, name), text);
    }
    notice.hide();
    new Notice(`已剪藏：${note.basename}`, 4000);
    return note;
  } catch (error) {
    notice.hide();
    new Notice(`剪藏失败：${error.message || error}`, 8000);
    throw error;
  }
}

/* --- entry points ----------------------------------------------------------- */

function sourceOf(plugin: IgnorancePlugin, file: TFile, text: string) {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
  const declared = [fm.source, fm.url, fm.link].find(value => typeof value === "string" && /^https?:/.test(value));
  return declared || text.match(URL_PATTERN)?.[0] || "";
}

/* The clip box. It never waits on the clipboard: the link is pasted by hand
   (the system paste menu needs no permission), and a readable clipboard only
   pre-fills it in the background. A pasted link starts the clip at once. */
class ClipModal extends Modal {
  constructor(plugin: IgnorancePlugin) { super(plugin.app); this.plugin = plugin; this.busy = false; }
  onOpen() {
    this.modalEl.addClass("ib-clip-modal");
    this.titleEl.setText("剪藏网页");
    const label = this.contentEl.createEl("label", { cls: "ib-form-label", text: "文章链接" });
    const field = this.contentEl.createDiv({ cls: "ib-clip-modal__field" });
    setIcon(field.createSpan({ cls: "ib-clip-modal__icon" }), "lucide-link");
    const input = this.input = field.createEl("input", {
      cls: "ib-clip-modal__input",
      attr: { id: "ib-clip-url", type: "url", placeholder: "长按此处粘贴链接", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go" }
    });
    label.setAttribute("for", "ib-clip-url");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: `支持公众号、X 与大多数文章网页。粘贴后自动开始，正文与图片保存到 ${clipFolder(this.plugin)}/。` });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    this.confirm = footer.createEl("button", { cls: "mod-cta", text: "剪藏" });
    this.confirm.addEventListener("click", () => this.submit());
    input.addEventListener("keydown", event => { if (event.key === "Enter") this.submit(); });
    input.addEventListener("paste", () => window.setTimeout(() => { if (URL_PATTERN.test(input.value)) this.submit(); }, 0));
    window.setTimeout(() => input.focus(), 50);
    // Fill from the clipboard only if it is readable without asking and the box is still empty.
    const reading = clipboardUrl();
    const timeout = new Promise(resolve => window.setTimeout(() => resolve(""), 800));
    void Promise.race([reading, timeout]).then(url => { if (url && !input.value) { input.value = url; input.select(); } });
  }
  async submit() {
    if (this.busy) return;
    const url = this.input.value.match(URL_PATTERN)?.[0];
    if (!url) { new Notice("请粘贴网页链接", 3000); this.input.focus(); return; }
    this.busy = true;
    this.close();
    const note = await clipUrl(this.plugin, url).catch(() => null);
    if (note) await this.plugin.app.workspace.getLeaf(false).openFile(note);
  }
  onClose() { this.contentEl.empty(); }
}

/* Several links at once: one per line (or pasted as a block of text). Links already clipped, recognised by the
   `source` property of a note in the vault, are skipped; failures are counted and the rest carry on. */
class BatchClipModal extends Modal {
  constructor(plugin: IgnorancePlugin) { super(plugin.app); this.plugin = plugin; this.busy = false; }
  onOpen() {
    this.titleEl.setText("批量剪藏网页");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: `每行一个链接，已经剪藏过的会跳过。保存到 ${clipFolder(this.plugin)}/。` });
    this.area = this.contentEl.createEl("textarea", { cls: "ib-clip-batch__area", attr: { rows: "8", placeholder: "粘贴链接，每行一个", spellcheck: "false" } });
    this.status = this.contentEl.createDiv({ cls: "ib-form-hint" });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    this.start = footer.createEl("button", { cls: "mod-cta", text: "开始" });
    this.start.addEventListener("click", () => void this.run());
    window.setTimeout(() => this.area.focus(), 50);
  }
  async run() {
    if (this.busy) return;
    const urls = [...new Set([...this.area.value.matchAll(new RegExp(URL_PATTERN.source, "g"))].map(match => match[0]))];
    if (!urls.length) { new Notice("请粘贴至少一个网页链接", 3000); return; }
    this.busy = true;
    this.start.setAttr("disabled", "true");
    const { app } = this.plugin;
    const known = new Set(app.vault.getMarkdownFiles().map((file: TFile) => app.metadataCache.getFileCache(file)?.frontmatter?.source).filter(Boolean));
    let done = 0, skipped = 0, failed = 0;
    for (const [index, url] of urls.entries()) {
      this.status.setText(`第 ${index + 1} / ${urls.length} 篇`);
      if (known.has(url)) { skipped += 1; continue; }
      const note = await clipUrl(this.plugin, url).catch(() => null);
      if (note) done += 1; else failed += 1;
    }
    new Notice(`批量剪藏完成：成功 ${done}，跳过 ${skipped}，失败 ${failed}`, 8000);
    this.close();
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmClipModal extends Modal {
  constructor(plugin: IgnorancePlugin, message, url, action) { super(plugin.app); this.message = message; this.url = url; this.action = action; }
  onOpen() {
    this.titleEl.setText("剪藏");
    this.contentEl.createEl("p", { text: this.message });
    this.contentEl.createEl("p", { cls: "ib-clip-confirm-url", text: this.url });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    footer.createEl("button", { cls: "mod-cta", text: "剪藏" }).addEventListener("click", () => { this.close(); this.action(); });
  }
  onClose() { this.contentEl.empty(); }
}

async function clipboardUrl() {
  try { return (await navigator.clipboard.readText()).match(URL_PATTERN)?.[0] || ""; } catch (_) { return ""; }
}

export function installWebClip(plugin: IgnorancePlugin) {
  const { app } = plugin;
  plugin.addCommand({
    id: "clip-web-pages-batch",
    name: "批量剪藏网页",
    icon: "lucide-scissors",
    callback: () => new BatchClipModal(plugin).open()
  });
  plugin.addCommand({
    id: "clip-web-page",
    name: "剪藏网页",
    icon: "lucide-scissors",
    callback: () => new ClipModal(plugin).open()
  });
  plugin.addCommand({
    id: "reclip-current-note",
    name: "重新剪藏当前笔记（按来源链接）",
    checkCallback: checking => {
      const file = app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (checking) return true;
      void app.vault.read(file).then(text => {
        const url = sourceOf(plugin, file, text);
        if (url) return clipUrl(plugin, url, file);
        return clipboardUrl().then(copied => copied ? clipUrl(plugin, copied, file) : new Notice("这篇笔记没有来源链接，剪贴板里也没有链接", 5000));
      }).catch(() => {});
      return true;
    }
  });
  const openClip = () => new ClipModal(plugin).open();
  plugin.addCommand({ id: "clip-clipboard-link", name: "粘贴链接剪藏", icon: "lucide-scissors", callback: openClip });
  plugin.addRibbonIcon("lucide-scissors", "剪藏网页", openClip);
  // 剪藏网页 in the note's "⋯" menu (no permanent header button).
  plugin.registerEvent(app.workspace.on("file-menu", (menu, _file, source) => {
    if (source !== "more-options") return;
    menu.addItem(item => item.setTitle("剪藏网页").setIcon("lucide-scissors").setSection("ibp-clip").onClick(openClip));
  }));

  // A lone link pasted into an empty note becomes the clipped article.
  plugin.registerEvent(app.workspace.on("editor-paste", (event, editor, info) => {
    if (event.defaultPrevented) return;
    const text = event.clipboardData?.getData("text/plain")?.trim() || "";
    const file = info?.file;
    if (!file || !isClipUrl(text) || editor.getValue().trim()) return;
    event.preventDefault();
    editor.setValue(text);
    void clipUrl(plugin, text, file).catch(() => {});
  }));

  // Share sheet: WeChat answers Obsidian's fetch with a verification page.
  // The share extension saves the note while the app (and this plugin) is
  // usually not running, so look again on startup and whenever the app comes
  // back to the foreground, as well as on files created while it runs.
  const repairing = new Set();
  const told = new Set();
  const repair = async (file: TFile) => {
    if (!(file instanceof TFile) || file.extension !== "md" || repairing.has(file.path)) return;
    if (Date.now() - (file.stat?.ctime || 0) > 24 * 60 * 60 * 1000 || (file.stat?.size || 0) > 20000) return;
    const text = await app.vault.read(file).catch(() => "");
    const url = sourceOf(plugin, file, text);
    const body = text.replace(/^---[\s\S]*?\n---\n?/, "").replace(URL_PATTERN, "").trim();
    if (url) {
      if (!isWeChat(url) || (!FAILED_CLIP.test(text) && body.length > 80)) return;
      repairing.add(file.path);
      try { await clipUrl(plugin, url, file); } catch (_) {} finally { repairing.delete(file.path); }
      return;
    }
    // Obsidian's share extension keeps only the verification page, not the
    // link. Offer the link on the clipboard (copy it in WeChat before sharing).
    if (!FAILED_CLIP.test(text) || told.has(file.path)) return;
    told.add(file.path);
    const copied = await clipboardUrl();
    if (copied) {
      new ConfirmClipModal(plugin, `「${file.basename}」是分享时抓取失败的页面，分享没有带上文章链接。用剪贴板里的链接重新剪藏它？`, copied,
        () => void clipUrl(plugin, copied, file).then(note => app.workspace.getLeaf(false).openFile(note)).catch(() => {})).open();
    } else {
      new Notice(`「${file.basename}」是分享时抓取失败的页面，分享没有带上文章链接。\n在微信里点「复制链接」，再对这条笔记运行「重新剪藏当前笔记」。`, 12000);
    }
  };
  const sweep = () => { for (const file of app.vault.getMarkdownFiles()) void repair(file); };

  // Optional: a link copied in another app is offered as soon as Obsidian is back.
  let lastOffered = "";
  const offerClipboard = async () => {
    if (!plugin.state.webClip?.watchClipboard) return;
    const url = await clipboardUrl();
    if (!url || url === lastOffered) return;
    lastOffered = url;
    const already = app.vault.getMarkdownFiles().some(file => app.metadataCache.getFileCache(file)?.frontmatter?.source === url);
    if (already) return;
    new ConfirmClipModal(plugin, `剪贴板里有一个链接，剪藏到 ${clipFolder(plugin)}/？`, url,
      () => void clipUrl(plugin, url).then(note => app.workspace.getLeaf(false).openFile(note)).catch(() => {})).open();
  };

  app.workspace.onLayoutReady(() => {
    window.setTimeout(sweep, 2000);
    plugin.registerEvent(app.vault.on("create", file => window.setTimeout(() => void repair(file), 1500)));
    plugin.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      window.setTimeout(sweep, 1500);
      window.setTimeout(() => void offerClipboard(), 600);
    });
  });
}
