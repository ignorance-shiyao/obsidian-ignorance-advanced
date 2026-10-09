/* The exported reader's cover block and colophon, from the note's properties:
   title, description, author, published / created, source, tags, cover image,
   plus word count and reading time. Layout only — the look comes from the
   --rd-* tokens in reader-app.ts, so a designed skin can restyle it. */
import { bytesToBase64 } from "./bytes.js";

const { requestUrl, TFile } = require("obsidian");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

const list = value => (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]).map(item => String(item).trim()).filter(Boolean);
const unlink = value => value.replace(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/, (_, target, alias) => alias || target);

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

// CJK characters count one each; other text by words.
export function readingStats(text) {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
  const words = (text.replace(/[㐀-鿿豈-﫿]/g, " ").match(/[A-Za-z0-9][\w'’-]*/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 400 + words / 220));
  return { count: cjk + words, minutes };
}

async function coverImage(plugin, file, value) {
  const raw = list(value)[0];
  if (!raw) return "";
  const target = unlink(raw.replace(/^!\[\[|\]\]$/g, "").replace(/^!?\[[^\]]*\]\(([^)]+)\)$/, "$1"));
  try {
    if (/^https?:/i.test(target)) {
      const response = await requestUrl({ url: target });
      const type = String(response.headers?.["content-type"] || "image/jpeg").split(";")[0];
      return `data:${type};base64,${bytesToBase64(new Uint8Array(response.arrayBuffer))}`;
    }
    const image = plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(target), file.path);
    if (!(image instanceof TFile)) return "";
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif" }[image.extension.toLowerCase()];
    return type ? `data:${type};base64,${bytesToBase64(new Uint8Array(await plugin.app.vault.readBinary(image)))}` : "";
  } catch (_) {
    return "";
  }
}

/* Returns { cover, colophon } HTML. Drops the note's own first H1 when it only
   repeats the title shown in the cover. */
export async function buildCover(plugin, file, content) {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
  const title = String(fm.title || file.basename).trim();
  const firstHeading = content.querySelector("h1");
  if (firstHeading && firstHeading.textContent.trim() === title && !firstHeading.previousElementSibling?.textContent.trim()) firstHeading.setAttribute("data-reader-duplicate-title", "");
  const description = String(fm.description || fm.summary || fm.subtitle || "").trim();
  const authors = list(fm.author || fm.authors).map(unlink);
  const published = formatDate(fm.published || fm.date);
  const created = formatDate(fm.created);
  const source = typeof fm.source === "string" && /^https?:/i.test(fm.source) ? fm.source : (typeof fm.url === "string" && /^https?:/i.test(fm.url) ? fm.url : "");
  const tags = list(fm.tags).map(tag => tag.replace(/^#/, ""));
  const image = await coverImage(plugin, file, fm.cover || fm.banner || fm.image);
  const { count, minutes } = readingStats(content.textContent || "");
  let host = "";
  try { host = source ? new URL(source).hostname.replace(/^www\./, "") : ""; } catch (_) {}

  const meta = [
    authors.length ? `<span class="ib-cover-meta-item" data-kind="author">${escapeHtml(authors.join("、"))}</span>` : "",
    published ? `<span class="ib-cover-meta-item" data-kind="date">${escapeHtml(published)}</span>` : "",
    `<span class="ib-cover-meta-item" data-kind="stats">${count.toLocaleString("zh-CN")} 字 · 约 ${minutes} 分钟</span>`,
    source ? `<a class="ib-cover-meta-item" data-kind="source" href="${escapeHtml(source)}" target="_blank" rel="noopener">${escapeHtml(host || "原文")}</a>` : ""
  ].filter(Boolean).join("");
  const cover = `<header class="ib-cover${image ? " has-image" : ""}" data-minutes="${minutes}">
    ${plugin.state.appearance?.decorations !== false ? `<span class="ib-cover-ambient" aria-hidden="true"></span><span class="ib-cover-watermark" aria-hidden="true">#</span>` : ""}
    ${image ? `<div class="ib-cover-image"><img src="${image}" alt=""></div>` : ""}
    <div class="ib-cover-body">
      ${tags.length ? `<div class="ib-cover-tags">${tags.slice(0, 6).map(tag => `<span class="ib-cover-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <h1 class="ib-cover-title">${escapeHtml(title)}</h1>
      ${description ? `<p class="ib-cover-description">${escapeHtml(description)}</p>` : ""}
      <div class="ib-cover-meta">${meta}</div>
    </div>
  </header>`;

  const exported = formatDate(new Date());
  const colophon = `<footer class="ib-colophon">
    <div class="ib-colophon-title">${escapeHtml(title)}</div>
    <div class="ib-colophon-lines">
      ${authors.length ? `<span>作者：${escapeHtml(authors.join("、"))}</span>` : ""}
      ${published || created ? `<span>日期：${escapeHtml(published || created)}</span>` : ""}
      ${source ? `<span>原文：<a href="${escapeHtml(source)}" target="_blank" rel="noopener">${escapeHtml(source)}</a></span>` : ""}
      <span>导出：${escapeHtml(exported)} · Obsidian · Ignorance</span>
    </div>
  </footer>`;
  return { cover, colophon, title };
}
