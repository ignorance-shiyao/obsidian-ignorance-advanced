/* The exported HTML reader's navigation and reading tools (inspired by VLOOK's
   reader; written from scratch). Everything is inlined: one offline file.
     - 导航中心: 目录 / 图片 / 表格 / 代码 / 图表 tabs with a filter box
     - header shows the current chapter; a progress bar under it
     - floating dock: previous / next chapter, back to top
     - image viewer: click an image, browse all of them (keys, swipe)
     - 宁静视图 hides the chrome; 字体风格 switches the reading font
     - keys: O 导航, Z 宁静视图, F 字体, D 明暗, [ ] 章节, Esc 关闭
   html-export.ts builds the page; this module adds ids, index lists, CSS and
   the runtime. Stable hooks kept for tests: .ib-reader-toc nav,
   [data-action="toc"], [data-action="theme"], .ib-reader-toc-hidden. */

export { iconMarkup as icon } from "./ui-icons.js";
import { iconMarkup as icon } from "./ui-icons.js";
import { languageIconSvg } from "./language-icons.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

const clip = (text, length = 48) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
};

// A short caption: the element's own label, else the text right after it.
function captionFor(element, fallback) {
  const own = element.getAttribute?.("alt") || element.getAttribute?.("aria-label") || element.querySelector?.("caption, figcaption")?.textContent;
  if (own && own.trim()) return clip(own);
  const next = element.closest("p, figure, div")?.nextElementSibling;
  const text = next && next.tagName === "P" ? next.textContent : "";
  return text && text.trim().length <= 60 ? clip(text) : fallback;
}

/* Tag figures, tables, code and diagrams with ids and return the index lists
   for the navigation center. `content` is the cloned note (detached DOM). */
export function indexContent(content) {
  const lists = { images: [], tables: [], code: [], charts: [] };
  const headings = [...content.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  // The heading an element sits under, for labels like "图表 3 · 序列图".
  const sectionOf = element => {
    let found = "";
    for (const heading of headings) {
      if (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) found = heading.textContent;
      else break;
    }
    return clip(found, 30);
  };
  // Headings that already carry a number ("1.", "一、", "第 2 章") skip the skin's automatic one.
  headings.forEach(heading => { if (/^\s*(?:第\s*[\d一二三四五六七八九十百]+\s*[章节部篇]|[\d一二三四五六七八九十]+(?:\.\d+)*\s*[.、．:：)\s])/.test(heading.textContent)) heading.setAttribute("data-ib-numbered", ""); });
  const withSection = (base, element) => { const section = sectionOf(element); return section ? `${base} · ${section}` : base; };
  const chartHosts = [...content.querySelectorAll("[data-reader-chart]")];
  chartHosts.forEach((el, index) => {
    el.id ||= `reader-chart-${index + 1}`;
    lists.charts.push({ id: el.id, label: captionFor(el, withSection(`图表 ${index + 1}`, el)) });
  });
  const images = [...content.querySelectorAll("img")].filter(img => !img.closest("[data-reader-chart]"));
  const doc = content.ownerDocument;
  const el = (tag, cls, text) => { const node = doc.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
  const toolButton = (action, label, name) => { const button = el("button", "ib-tool"); button.type = "button"; button.dataset.tool = action; button.dataset.tip = label; button.setAttribute("aria-label", label); button.innerHTML = icon(name); return button; };

  // Images: numbered; a caption from meaningful alt text (Obsidian never shows alt).
  images.forEach((img, index) => {
    img.id ||= `reader-image-${index + 1}`;
    img.setAttribute("data-reader-image", String(index));
    const alt = (img.getAttribute("alt") || "").trim();
    const meaningful = alt && !/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(alt) && !/^[\w-]+-\d+$/.test(alt) && alt !== "图像" && alt !== "image";
    const block = img.parentElement;
    const alone = block && block.querySelectorAll("img").length === 1;
    if (meaningful && alone && !img.closest("a, table")) {
      const caption = el("span", "ib-caption ib-figure-caption");
      caption.append(el("b", "", `图 ${index + 1}`), doc.createTextNode(` ${alt}`));
      img.after(caption);
    }
    lists.images.push({ id: img.id, label: captionFor(img, withSection(`图 ${index + 1}`, img)) });
  });

  // Tables: a frame with the number and tools (冻结首列 / 换行 / 全屏).
  [...content.querySelectorAll("table")].forEach((table, index) => {
    table.id ||= `reader-table-${index + 1}`;
    const head = [...table.querySelectorAll("tr:first-child > *")].map(cell => cell.textContent.trim()).filter(Boolean).slice(0, 3).join(" · ");
    lists.tables.push({ id: table.id, label: captionFor(table, head ? `表 ${index + 1}：${clip(head, 36)}` : withSection(`表 ${index + 1}`, table)) });
    const frame = el("div", "ib-table-frame is-frozen");
    if (table.dataset.ibTableAlign) frame.dataset.ibTableAlign = table.dataset.ibTableAlign;
    const bar = el("div", "ib-block-bar");
    bar.append(el("span", "ib-caption", `表 ${index + 1}`), el("span", "ib-bar-space"),
      toolButton("freeze", "冻结首列", "freeze"), toolButton("wrap", "切换换行", "wrap"), toolButton("full", "全屏查看", "zen"));
    bar.querySelector('[data-tool="freeze"]').setAttribute("aria-pressed", "true");
    const scroller = el("div", "ib-table-scroll");
    table.replaceWith(frame);
    scroller.append(table);
    frame.append(bar, scroller);
  });

  // Code: language, copy, and long blocks folded.
  [...content.querySelectorAll("pre")].forEach((pre, index) => {
    pre.id ||= `reader-code-${index + 1}`;
    const language = pre.getAttribute("data-lang") || "";
    const first = pre.textContent.split("\n").map(line => line.trim()).find(Boolean) || "";
    lists.code.push({ id: pre.id, label: `${language ? `${language} · ` : ""}${clip(first, 40) || `代码 ${index + 1}`}` });
    // Keep separators for exact copying; normal whitespace on the wrapper
    // prevents them from creating extra visual lines between block spans.
    pre.querySelectorAll("code").forEach(code => {
      if (!code.querySelector(":scope > [data-ib-line]")) return;
      code.setAttribute("data-ib-lines", "");
    });
    const lineCount = pre.querySelectorAll("[data-ib-line]").length;
    const lines = lineCount || pre.textContent.replace(/\n$/, "").split("\n").length;
    const frame = el("div", "ib-code-frame");
    if (pre.dataset.ibChartAlign) frame.dataset.ibChartAlign = pre.dataset.ibChartAlign;
    if (pre.dataset.ibChartWidth) frame.style.width = `min(100%, ${pre.dataset.ibChartWidth}px)`;
    const bar = el("div", "ib-block-bar");
    const langIcon = el("span", "ib-lang-icon");
    langIcon.setAttribute("aria-hidden", "true");
    langIcon.innerHTML = languageIconSvg(language) || icon("code");
    bar.append(langIcon, el("span", "ib-caption", language || "代码"), el("span", "ib-bar-space"));
    if (lines > 20) bar.append(toolButton("fold", "展开 / 折叠", "fold"));
    bar.append(toolButton("copy", "复制代码", "copy"));
    if (lines > 20) frame.classList.add("is-folded");
    pre.replaceWith(frame);
    frame.append(bar, pre);
    if (lines > 20) { const more = el("button", "ib-code-more", `展开全部 ${lines} 行`); more.type = "button"; more.dataset.tool = "fold"; frame.append(more); }
  });
  return lists;
}

const TABS = [
  ["toc", "目录", "list"],
  ["images", "图片", "image"],
  ["tables", "表格", "table"],
  ["code", "代码", "code"],
  ["charts", "图表", "chart"]
];

// The aside: tab strip, filter box, one panel per tab (目录 keeps .ib-reader-toc nav).
export function navigationMarkup(tocHtml, lists) {
  const counts = { toc: tocHtml ? 1 : 0, images: lists.images.length, tables: lists.tables.length, code: lists.code.length, charts: lists.charts.length };
  const tabs = TABS.filter(([key]) => key === "toc" || counts[key]);
  const strip = tabs.map(([key, label, name], index) =>
    `<button type="button" class="ib-nav-tab" role="tab" data-tab="${key}" aria-selected="${index === 0}" data-tip="${label}">${icon(name)}<span>${label}</span>${key === "toc" ? "" : `<em>${counts[key]}</em>`}</button>`).join("");
  const item = entry => `<a href="#${entry.id}">${escapeHtml(entry.label)}</a>`;
  const panels = tabs.map(([key], index) => {
    const body = key === "toc" ? (tocHtml || `<div class="ib-reader-empty">本文没有标题</div>`) : lists[key].map(item).join("");
    return `<nav class="ib-nav-panel" data-panel="${key}"${index === 0 ? "" : " hidden"}>${key === "toc" ? '<span class="ib-toc-indicator" aria-hidden="true" hidden></span>' : ""}${body}</nav>`;
  }).join("");
  return `<aside id="ib-reader-navigation" class="ib-reader-toc" aria-label="导航中心">
    <div class="ib-nav-head"><div class="ib-nav-tabs" role="tablist">${strip}</div>
    <label class="ib-nav-search">${icon("search")}<input type="search" placeholder="筛选…  /" aria-label="筛选导航"></label></div>
    ${panels}
    <div class="ib-nav-none" hidden>没有匹配的条目</div>
  </aside>`;
}

export function headerMarkup(title) {
  return `<header class="ib-reader-header">
    <button class="ib-reader-button ib-icon-button" type="button" data-action="back" aria-label="返回" data-tip="返回">${icon("prev")}</button>
    <button class="ib-reader-button ib-icon-button" type="button" data-action="toc" aria-label="导航中心（O）" data-tip="导航中心" data-key="O">${icon("list")}</button>
    <div class="ib-reader-heading"><div class="ib-reader-title">${escapeHtml(title)}</div><div class="ib-reader-chapter" aria-live="polite"></div></div>
    <select class="ib-reader-width" aria-label="正文宽度" data-tip="正文宽度"><option value="narrow">窄</option><option value="standard" selected>标准</option><option value="wide">宽</option><option value="full">全宽</option></select>
    <button class="ib-reader-button ib-icon-button" type="button" data-action="font" aria-label="字体风格（F）" data-tip="字体风格" data-key="F">${icon("type")}</button>
    <button class="ib-reader-button ib-icon-button" type="button" data-action="zen" aria-label="宁静视图（Z）" data-tip="宁静视图" data-key="Z">${icon("zen")}</button>
    <button class="ib-reader-button ib-icon-button" type="button" data-action="theme" aria-label="切换明暗（D）" data-tip="切换明暗" data-key="D"><span class="ib-when-light">${icon("moon")}</span><span class="ib-when-dark">${icon("sun")}</span></button>
    <div class="ib-reader-progress" aria-hidden="true"><span></span></div>
  </header>`;
}

// Wide screens: the current chapter's sections, progress and section stepping.
export function railMarkup() {
  return `<aside class="ib-rail" aria-label="本章目录">
    <div class="ib-rail-title">本章目录</div>
    <nav class="ib-rail-list"></nav>
    <div class="ib-rail-progress"><div class="ib-rail-progress-row"><span>阅读进度</span><b>0%</b></div><div class="ib-rail-bar"><span></span></div><div class="ib-rail-left"></div></div>
    <div class="ib-rail-steps"><button type="button" data-action="prev-section">${icon("prev")}<span>上一节</span></button><button type="button" data-action="next-section"><span>下一节</span>${icon("next")}</button></div>
  </aside>`;
}

export function overlayMarkup() {
  return `<div class="ib-dock" aria-label="章节导航">
    <button type="button" data-action="prev-chapter" data-tip="上一章" data-key="[" aria-label="上一章">${icon("prev")}</button>
    <button type="button" data-action="top" data-tip="回到顶部" aria-label="回到顶部">${icon("up")}</button>
    <button type="button" data-action="next-chapter" data-tip="下一章" data-key="]" aria-label="下一章">${icon("next")}</button>
  </div>
  <button type="button" class="ib-zen-exit" data-action="zen" aria-label="退出宁静视图">${icon("close")}<span>退出宁静视图</span></button>
  <div class="ib-font-menu" role="menu" hidden>
    <button type="button" role="menuitemradio" data-font="theme">主题默认</button>
    <button type="button" role="menuitemradio" data-font="sans">无衬线 · 清晰</button>
    <button type="button" role="menuitemradio" data-font="serif">衬线 · 书卷</button>
    <button type="button" role="menuitemradio" data-font="kai">楷体 · 温和</button>
    <button type="button" role="menuitemradio" data-font="mono">等宽 · 技术</button>
  </div>
  <div class="ib-viewer" role="dialog" aria-modal="true" aria-label="图片查看器" hidden>
    <div class="ib-viewer-bar"><span class="ib-viewer-count"></span><span class="ib-viewer-caption"></span><button type="button" data-viewer="close" aria-label="关闭（Esc）">${icon("close")}</button></div>
    <button type="button" class="ib-viewer-nav" data-viewer="prev" aria-label="上一张">${icon("prev")}</button>
    <div class="ib-viewer-stage"></div>
    <button type="button" class="ib-viewer-nav" data-viewer="next" aria-label="下一张">${icon("next")}</button>
  </div>`;
}

export function readerAppCss() {
  return `
    .ib-rail { display:none; }
    /* Keep completed blocks paintable during fast scrolling. */
    .ib-reader-note > :not(.ib-cover):not(.ib-colophon) { content-visibility:visible; }
    .ib-reader-note table[data-ib-table-align="left"] { margin-inline:0 auto !important; }
    .ib-reader-note table[data-ib-table-align="center"] { margin-inline:auto !important; }
    .ib-reader-note table[data-ib-table-align="right"] { margin-inline:auto 0 !important; }
    @media print { .ib-reader-note > * { content-visibility:visible !important; } }
    @media (min-width:1280px) {
      .ib-reader-layout { grid-template-columns:260px minmax(0,1fr) 232px !important; max-width:1680px !important; }
      .ib-reader-toc-hidden .ib-reader-layout { grid-template-columns:0 minmax(0,1fr) 232px !important; }
      .ib-reader.ib-zen .ib-reader-layout { grid-template-columns:minmax(0,1fr) !important; }
      .ib-reader.ib-zen .ib-rail { display:none; }
      .ib-rail { position:sticky; top:56px; align-self:start; display:flex; flex-direction:column; gap:18px; height:calc(100vh - 56px); overflow:auto; padding:28px 20px 24px 8px; }
      .ib-reader:has(.ib-rail-list:empty) .ib-rail-title, .ib-rail-list:empty { display:none; }
    }
    .ib-rail-title { color:var(--rd-text-primary); font-size:13px; font-weight:700; }
    .ib-rail-list { display:grid; gap:2px; margin-top:-8px; border-left:1px solid var(--rd-border); }
    .ib-rail-list a { display:block; margin-left:-1px; padding:5px 10px; border-left:2px solid transparent; color:var(--rd-text-secondary); font-size:12.5px; line-height:1.45; text-decoration:none; }
    .ib-rail-list a[data-level="deeper"] { padding-left:22px; font-size:12px; }
    .ib-rail-list a:hover { color:var(--rd-text-accent); }
    .ib-rail-list a[aria-current="true"] { border-left-color:var(--rd-accent); color:var(--rd-text-accent); background:var(--rd-bg-hover); font-weight:600; }
    .ib-rail-progress { padding:14px; border:1px solid var(--rd-border); border-radius:var(--rd-radius-m); background:var(--rd-bg-surface); font-size:12px; color:var(--rd-text-secondary); }
    .ib-rail-progress-row { display:flex; justify-content:space-between; }
    .ib-rail-progress b { color:var(--rd-text-primary); font-variant-numeric:tabular-nums; }
    .ib-rail-bar { height:4px; margin:10px 0 8px; border-radius:4px; background:var(--rd-border); overflow:hidden; }
    .ib-rail-bar span { display:block; width:100%; height:100%; border-radius:4px; background:var(--rd-accent); transform:scaleX(0); transform-origin:left center; }
    .ib-rail-left { color:var(--rd-text-muted); font-size:11.5px; }
    .ib-rail-steps { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .ib-rail-steps button { display:flex; align-items:center; justify-content:center; gap:4px; padding:8px 6px; border:1px solid var(--rd-border); border-radius:var(--rd-radius-s); color:var(--rd-text-secondary); background:var(--rd-bg-surface); font:inherit; font-size:12px; cursor:pointer; }
    .ib-rail-steps button:hover { color:var(--rd-text-accent); border-color:color-mix(in srgb, var(--rd-accent) 40%, var(--rd-border)); }
    .ib-rail-steps button:disabled { opacity:.4; cursor:default; }
    .ib-rail-steps .ib-icon { width:14px; height:14px; }
    /* Design tokens. Every reader component reads these; a designed skin only
       has to set new values (per data-theme). Defaults follow the note theme. */
    .ib-reader {
      --rd-bg-page:var(--ib-bg-primary); --rd-bg-surface:var(--ib-bg-primary); --rd-bg-sidebar:var(--ib-bg-secondary);
      --rd-bg-chrome:var(--ib-bg-chrome,var(--ib-bg-secondary)); --rd-bg-hover:var(--ib-bg-hover,var(--ib-bg-secondary));
      --rd-bg-active:var(--ib-bg-active,var(--rd-bg-hover)); --rd-bg-code:var(--ib-code-bg,var(--ib-bg-secondary));
      --rd-overlay:rgba(12,14,18,.97);
      --rd-text-primary:var(--ib-text-primary); --rd-text-secondary:var(--ib-text-secondary); --rd-text-muted:var(--ib-text-muted,var(--ib-text-secondary));
      --rd-text-accent:var(--ib-text-accent,var(--ib-accent-brand,#4d81ef)); --rd-accent:var(--ib-accent-brand,#4d81ef);
      --rd-border:var(--ib-border-default); --rd-border-strong:var(--ib-border-strong,var(--ib-border-default));
      --rd-radius-s:6px; --rd-radius-m:10px; --rd-radius-l:14px;
      --rd-shadow-1:0 1px 2px rgba(0,0,0,.06); --rd-shadow-2:0 6px 20px rgba(0,0,0,.10); --rd-shadow-3:0 12px 32px rgba(0,0,0,.16);
      --rd-font-title:var(--ib-font-heading,var(--ib-font-serif,serif)); --rd-cover-title-size:clamp(28px,4.2vw,44px);
      --rd-ease:var(--ib-ease-out); --rd-duration:var(--ib-dur-base);
    }

    .ib-reader { --ib-cover-watermark-size:60px; --ib-cover-watermark-opacity:.08; --ib-cover-ambient-size:320px; --ib-cover-ambient-blur:120px; --ib-cover-ambient-opacity:.12; }
    .ib-cover-ambient, .ib-cover-watermark { position:absolute; pointer-events:none; user-select:none; }
    .ib-cover-ambient { top:0; right:0; width:var(--ib-cover-ambient-size); height:var(--ib-cover-ambient-size); border-radius:50%; background:var(--ib-accent-brand); opacity:var(--ib-cover-ambient-opacity); filter:blur(var(--ib-cover-ambient-blur)); }
    .ib-cover-watermark { top:0; right:24px; color:var(--ib-text-primary); font-family:var(--font-monospace,monospace); font-size:var(--ib-cover-watermark-size); font-weight:700; line-height:1; opacity:var(--ib-cover-watermark-opacity); }
    .ib-cover-body, .ib-cover-image { position:relative; }
    [data-ib-toc] { background:color-mix(in srgb,var(--rd-accent) 5%,var(--rd-bg-surface)) !important; border-color:color-mix(in srgb,var(--rd-accent) 16%,var(--rd-border)) !important; color:var(--rd-text-primary) !important; }
    .ib-reader-note a { color:var(--ib-link) !important; }
    .ib-reader-note a:visited { color:var(--ib-link-visited) !important; }
    .ib-reader-note a[data-ib-link-broken] { color:var(--ib-link-broken) !important; }
    [data-ib-chapter] { background:var(--ib-bg-tertiary) !important; }
    [data-ib-chapter-rail] { background:var(--ib-chapter-rail-brand,var(--ib-accent-brand)) !important; }
    [data-ib-chapter-tone="1"] > [data-ib-chapter-rail] { background:var(--ib-chapter-rail-purple,#8b5cf6) !important; }
    [data-ib-chapter-tone="2"] > [data-ib-chapter-rail] { background:var(--ib-chapter-rail-cyan,#22b8d6) !important; }
    [data-ib-toc] :is(ul,li) { color:var(--rd-text-primary) !important; }
    [data-ib-toc] a { color:var(--rd-text-accent) !important; }
    [data-ib-toc-title] { background:var(--rd-bg-sidebar) !important; border-color:var(--rd-border) !important; color:var(--rd-text-muted) !important; }
    .ib-table-frame:not(.is-full) { width:fit-content; max-width:100%; }
    body[data-ib-table-alignment="left"] .ib-table-frame:not(.is-full) { margin-inline-start:0; margin-inline-end:auto; }
    body[data-ib-table-alignment="center"] .ib-table-frame:not(.is-full) { margin-inline:auto; }
    body[data-ib-table-alignment="right"] .ib-table-frame:not(.is-full) { margin-inline-start:auto; margin-inline-end:0; }
    .ib-table-frame[data-ib-table-align="left"]:not(.is-full) { margin-inline:0 auto !important; }
    .ib-table-frame[data-ib-table-align="center"]:not(.is-full) { margin-inline:auto !important; }
    .ib-table-frame[data-ib-table-align="right"]:not(.is-full) { margin-inline:auto 0 !important; }
    .ib-cover { position:relative; overflow:clip; isolation:isolate; margin:0 0 40px; padding:8px 0 28px; border-bottom:1px solid var(--rd-border); }
    .ib-cover.has-image { padding-top:0; }
    .ib-cover-image { margin:0 0 28px; border-radius:var(--rd-radius-l); overflow:hidden; aspect-ratio:21 / 9; background:var(--rd-bg-sidebar); }
    .ib-cover-image img { display:block; width:100%; height:100%; object-fit:cover; }
    .ib-cover-tags { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 14px; }
    .ib-cover-tag { padding:2px 10px; border-radius:999px; color:var(--rd-text-accent); background:color-mix(in srgb, var(--rd-accent) 12%, transparent); font-size:12px; font-weight:500; }
    .ib-cover-title { margin:0 !important; padding:0 !important; border:0 !important; color:var(--rd-text-primary); font-family:var(--rd-font-title); font-size:var(--rd-cover-title-size) !important; font-weight:750; line-height:1.22 !important; letter-spacing:-.01em; text-wrap:balance; }
    .ib-reader-note :is(p, li, blockquote, figcaption) { text-wrap:pretty; } /* no lone character on a paragraph's last line */
    .ib-reader-note :is(h1, h2, h3, h4) { text-wrap:balance; }
    .ib-cover-title::before, .ib-cover-title::after { content:none !important; }
    .ib-cover-description { margin:14px 0 0 !important; color:var(--rd-text-secondary); font-size:17px; line-height:1.7; text-wrap:pretty; }
    .ib-cover-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; margin-top:20px; color:var(--rd-text-muted); font-size:13px; }
    .ib-cover-meta-item + .ib-cover-meta-item::before { content:""; display:inline-block; width:3px; height:3px; margin-right:12px; border-radius:50%; background:currentColor; vertical-align:middle; opacity:.6; }
    .ib-cover-meta a { color:var(--rd-text-accent); text-decoration:none; }
    .ib-cover-meta a:hover { text-decoration:underline; }
    [data-reader-duplicate-title] { display:none !important; }

    .ib-colophon { margin:64px 0 0; padding:24px 0 0; border-top:1px solid var(--rd-border); color:var(--rd-text-muted); font-size:13px; line-height:1.8; }
    .ib-colophon-title { margin-bottom:6px; color:var(--rd-text-secondary); font-weight:600; }
    .ib-colophon-lines { display:flex; flex-direction:column; }
    .ib-colophon a { color:var(--rd-text-accent); word-break:break-all; }

    .ib-tip { position:fixed; z-index:50; padding:5px 9px; border-radius:var(--rd-radius-s); color:#fff; background:rgba(20,22,28,.92); font-size:12px; line-height:1.3; white-space:nowrap; pointer-events:none; opacity:0; transform:translateY(-2px); transition:opacity var(--ib-dur-fast) var(--rd-ease), transform var(--ib-dur-fast) var(--rd-ease); }
    .ib-tip.is-shown { opacity:1; transform:none; }
    .ib-tip kbd { margin-left:6px; padding:0 5px; border:1px solid rgba(255,255,255,.3); border-radius:4px; font:inherit; font-size:11px; opacity:.85; }

    .ib-icon { width:18px; height:18px; flex:0 0 auto; }
    .ib-reader-header { flex-wrap:nowrap; }
    .ib-icon-button { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0 !important; border-color:transparent !important; background:transparent !important; color:var(--rd-text-secondary) !important; }
    .ib-icon-button:hover, .ib-icon-button[aria-pressed="true"] { color:var(--rd-text-accent) !important; background:var(--rd-bg-hover) !important; }
    .ib-reader-heading { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
    .ib-reader-chapter { overflow:hidden; color:var(--rd-text-secondary); font-size:12px; text-overflow:ellipsis; white-space:nowrap; min-height:0; }
    .ib-reader-chapter:empty { display:none; }
    .ib-reader-progress { position:absolute; left:0; right:0; bottom:-1px; height:2px; pointer-events:none; }
    .ib-reader-progress span { display:block; width:100%; height:100%; background:var(--rd-accent); transform:scaleX(0); transform-origin:left center; will-change:transform; }
    .ib-reader-header { position:sticky; }
    .ib-reader[data-theme="dark"] .ib-when-light, .ib-reader[data-theme="light"] .ib-when-dark { display:none; }
    .ib-when-light, .ib-when-dark { display:inline-flex; }

    .ib-nav-head { position:sticky; top:-24px; z-index:1; margin:-24px -14px 8px -22px; padding:16px 14px 2px 22px; background:var(--rd-bg-sidebar); }
    .ib-nav-tabs { display:flex; gap:2px; margin:0 -6px 10px; padding:3px; border-radius:10px; background:var(--rd-bg-surface); border:1px solid var(--rd-border); }
    .ib-nav-tab { position:relative; flex:1 1 0; display:flex; flex-direction:column; align-items:center; gap:2px; min-width:0; padding:6px 2px; border:0; border-radius:7px; color:var(--rd-text-secondary); background:transparent; font:inherit; font-size:11px; cursor:pointer; }
    .ib-nav-tab .ib-icon { width:16px; height:16px; }
    .ib-nav-tab em { position:absolute; top:2px; left:calc(50% + 6px); min-width:15px; height:15px; padding:0 4px; box-sizing:border-box; border-radius:8px; font-style:normal; font-size:9.5px; font-weight:600; line-height:15px; text-align:center; font-variant-numeric:tabular-nums; color:var(--rd-text-secondary); background:var(--rd-border); box-shadow:0 0 0 2px var(--rd-bg-surface); }
    .ib-nav-tab[aria-selected="true"] em { color:#fff; background:var(--rd-text-accent); box-shadow:0 0 0 2px var(--rd-bg-active); }
    .ib-nav-tab[aria-selected="true"] { color:var(--rd-text-accent); background:var(--rd-bg-active); font-weight:600; }
    .ib-nav-search { display:flex; align-items:center; gap:6px; margin:0 -2px 10px; padding:0 10px; height:34px; border:1px solid var(--rd-border); border-radius:8px; background:var(--rd-bg-surface); color:var(--rd-text-secondary); }
    .ib-nav-search .ib-icon { width:15px; height:15px; }
    .ib-nav-search input { flex:1; min-width:0; border:0; outline:0; background:transparent; color:var(--rd-text-primary); font:inherit; font-size:13px; }
    .ib-nav-search:focus-within { border-color:var(--rd-accent); }
    .ib-nav-panel { display:grid; gap:3px; }
    .ib-nav-panel[hidden], .ib-nav-none[hidden], [data-filtered-out] { display:none !important; }
    .ib-nav-panel a { display:block; overflow:hidden; border-radius:6px; padding:6px 8px; color:var(--rd-text-secondary); font-size:13px; line-height:1.45; text-decoration:none; text-overflow:ellipsis; }
    .ib-nav-panel a:hover, .ib-nav-panel a[aria-current="location"] { color:var(--rd-text-accent); background:var(--rd-bg-active); }
    .ib-nav-none { padding:12px 8px; color:var(--rd-text-secondary); font-size:13px; }
    .ib-reader-toc-title { display:none; }
    :target { outline:1px solid var(--rd-accent); outline-offset:4px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
      button:active, .ib-dock { transform:none !important; }
    }
    .ib-reader-note [id^="reader-"] { scroll-margin-top:84px; }

    .ib-dock { position:fixed; right:20px; bottom:20px; z-index:25; display:flex; gap:2px; padding:4px; border:1px solid var(--rd-border); border-radius:999px; background:color-mix(in srgb, var(--rd-bg-surface) 88%, transparent); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); box-shadow:var(--rd-shadow-2); opacity:0; transform:translateY(8px); pointer-events:none; transition:opacity var(--ib-dur-base) var(--rd-ease), transform var(--ib-dur-base) var(--rd-ease); }
    .ib-reader.ib-scrolled .ib-dock { opacity:1; transform:none; pointer-events:auto; }
    .ib-dock button { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border:0; border-radius:999px; color:var(--rd-text-secondary); background:transparent; cursor:pointer; }
    .ib-dock button:hover { color:var(--rd-text-accent); background:var(--rd-bg-hover); }
    .ib-dock button:disabled { opacity:.35; cursor:default; }

    .ib-zen-exit { position:fixed; top:14px; right:14px; z-index:26; display:none; align-items:center; gap:6px; padding:7px 12px; border:1px solid var(--rd-border); border-radius:999px; color:var(--rd-text-secondary); background:var(--rd-bg-surface); font:inherit; font-size:13px; cursor:pointer; opacity:.35; transition:opacity var(--ib-dur-base) var(--rd-ease); }
    .ib-zen-exit:hover, .ib-zen-exit:focus-visible { opacity:1; }
    .ib-reader.ib-zen .ib-zen-exit { display:inline-flex; }
    .ib-reader.ib-zen .ib-reader-header, .ib-reader.ib-zen .ib-reader-toc { display:none; }
    .ib-reader.ib-zen .ib-reader-layout { grid-template-columns:minmax(0,1fr); }
    .ib-reader.ib-zen .ib-reader-main { padding-top:64px; }

    .ib-font-menu { position:fixed; z-index:30; display:grid; min-width:168px; padding:5px; border:1px solid var(--rd-border); border-radius:10px; background:var(--rd-bg-surface); box-shadow:var(--rd-shadow-3); }
    .ib-font-menu[hidden] { display:none; }
    .ib-font-menu button { padding:8px 10px; border:0; border-radius:6px; color:var(--rd-text-primary); background:transparent; font:inherit; font-size:14px; text-align:left; cursor:pointer; }
    .ib-font-menu button:hover { background:var(--rd-bg-hover); }
    .ib-font-menu button[aria-checked="true"] { color:var(--rd-text-accent); font-weight:600; }
    .ib-reader[data-font="sans"], .ib-reader[data-font="sans"] .ib-reader-note { --font-text:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif; }
    .ib-reader[data-font="serif"], .ib-reader[data-font="serif"] .ib-reader-note { --font-text:"Songti SC","Noto Serif SC","Source Han Serif SC","SimSun",Georgia,serif; }
    .ib-reader[data-font="kai"], .ib-reader[data-font="kai"] .ib-reader-note { --font-text:"Kaiti SC","STKaiti","KaiTi","LXGW WenKai",serif; }
    .ib-reader[data-font="mono"], .ib-reader[data-font="mono"] .ib-reader-note { --font-text:"SF Mono","JetBrains Mono",Menlo,Consolas,"PingFang SC",monospace; }
    .ib-reader:not([data-font="theme"]) .ib-reader-note :is(p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption),
    .ib-reader:not([data-font="theme"]) .ib-cover-title { font-family:var(--font-text) !important; }

    .ib-reader-note img[data-reader-image] { cursor:zoom-in; }
    .ib-viewer { position:fixed; inset:0; z-index:40; display:grid; grid-template-columns:64px minmax(0,1fr) 64px; grid-template-rows:auto minmax(0,1fr); background:var(--rd-overlay); color:#fff; }
    .ib-viewer[hidden] { display:none; }
    .ib-viewer-bar { grid-column:1 / -1; display:flex; align-items:center; gap:12px; padding:12px 12px 12px 20px; font-size:13px; }
    .ib-viewer-count { opacity:.7; font-variant-numeric:tabular-nums; }
    .ib-viewer-caption { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ib-viewer button { display:inline-flex; align-items:center; justify-content:center; border:0; color:#fff; background:transparent; cursor:pointer; }
    .ib-viewer-bar button { width:40px; height:40px; border-radius:999px; }
    .ib-viewer-bar button:hover, .ib-viewer-nav:hover { background:rgba(255,255,255,.12); }
    .ib-viewer-nav { align-self:center; justify-self:center; width:44px; height:44px; border-radius:999px; }
    .ib-viewer-nav:disabled { opacity:.25; }
    .ib-viewer .ib-icon { width:22px; height:22px; }
    .ib-viewer-stage { display:flex; align-items:center; justify-content:center; min-width:0; min-height:0; overflow:auto; padding:0 0 24px; touch-action:pan-x pan-y pinch-zoom; }
    .ib-viewer-stage img { max-width:100%; max-height:100%; object-fit:contain; border-radius:4px; background:#fff; cursor:zoom-in; user-select:none; }
    .ib-viewer-stage.is-zoomed { display:block; }
    .ib-viewer-stage.is-zoomed img { max-width:none; max-height:none; cursor:zoom-out; }

    .ib-caption { color:var(--rd-text-secondary); font-size:12.5px; }
    .ib-caption b { margin-right:4px; color:var(--rd-text-primary); font-weight:600; }
    .ib-figure-caption { display:block; margin:6px auto 0; text-align:center; }
    .ib-block-bar { display:flex; align-items:center; gap:2px; min-height:32px; padding:2px 4px 2px 10px; }
    .ib-bar-space { flex:1; }
    .ib-tool { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:0; border-radius:6px; color:var(--rd-text-secondary); background:transparent; cursor:pointer; opacity:.55; transition:opacity var(--ib-dur-fast) var(--rd-ease), color var(--ib-dur-fast) var(--rd-ease); }
    .ib-tool .ib-icon { width:15px; height:15px; }
    :is(.ib-table-frame, .ib-code-frame):hover .ib-tool, .ib-tool:focus-visible, .ib-tool[aria-pressed="true"] { opacity:1; }
    .ib-tool:hover { background:var(--rd-bg-hover); color:var(--rd-text-primary); }
    .ib-tool[aria-pressed="true"] { color:var(--rd-text-accent); }
    @media (hover:none) { .ib-tool { opacity:1; } }

    .ib-table-frame { margin:14.4px 0; border:1px solid var(--rd-border); border-radius:10px; background:var(--rd-bg-surface); overflow:hidden; }
    .ib-table-frame .ib-block-bar { border-bottom:1px solid var(--rd-border); background:var(--rd-bg-sidebar); }
    .ib-table-scroll { overflow:auto; -webkit-overflow-scrolling:touch; }
    .ib-table-scroll > table { margin:0 !important; min-width:100%; border:0 !important; border-radius:0 !important; }
    .ib-table-frame.is-nowrap :is(th, td) { white-space:nowrap !important; }
    .ib-table-frame.is-frozen tr > td:first-child { background:var(--rd-bg-surface) !important; }
    .ib-table-frame.is-frozen tr > :first-child { position:sticky !important; left:0; z-index:1; box-shadow:1px 0 0 var(--rd-border); }
    .ib-table-frame.is-frozen :is(thead tr, tr:first-child) > th:first-child { z-index:3; background:var(--ib-bg-secondary, var(--rd-bg-sidebar)) !important; }
    .ib-table-frame.is-full { position:fixed; inset:0; z-index:35; margin:0; border:0; border-radius:0; display:flex; flex-direction:column; }
    .ib-table-frame.is-full .ib-table-scroll { flex:1; min-height:0; }
    .ib-table-frame.is-full :is(thead th, tr:first-child > th) { position:sticky !important; top:0; z-index:2; }

    .ib-lang-icon { display:inline-flex; flex:0 0 auto; width:18px; height:18px; margin-right:8px; color:var(--rd-text-secondary); }
    .ib-lang-icon svg { width:100%; height:100%; }
    .ib-li-light { display:none; }
    .ib-reader[data-theme="light"] .ib-li-dark { display:none; }
    .ib-reader[data-theme="light"] .ib-li-light { display:inline; }
    .ib-code-frame { position:relative; margin:12px 0; border:1px solid var(--rd-border); border-radius:10px; background:var(--rd-bg-code); overflow:hidden; }
    .ib-code-frame[data-ib-chart-align]:not([style*="width"]) { width:fit-content; max-width:100%; min-width:min(100%,320px); }
    .ib-code-frame[data-ib-chart-align="left"] { margin-inline:0 auto; }
    .ib-code-frame[data-ib-chart-align="center"] { margin-inline:auto; }
    .ib-code-frame[data-ib-chart-align="right"] { margin-inline:auto 0; }
    .ib-code-frame .ib-block-bar { border-bottom:1px solid color-mix(in srgb, var(--rd-border) 70%, transparent); }
    .ib-code-frame .ib-caption { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:11.5px; text-transform:lowercase; }
    .ib-code-frame > pre { margin:0 !important; border:0 !important; border-radius:0 !important; }
    /* Line numbers: Obsidian draws them with ::before, which the export cannot copy. */
    .ib-code-frame code[data-ib-lines] { counter-reset:ib-ln; white-space:normal !important; }
    .ib-code-frame [data-ib-line] { position:relative; counter-increment:ib-ln; min-height:1.65em; }
    .ib-code-frame [data-ib-line]::before { content:counter(ib-ln); position:absolute; left:0; width:2.6em; padding-right:.9em; box-sizing:border-box; text-align:right; color:var(--rd-code-line, var(--rd-text-muted)); opacity:.8; user-select:none; }
    .ib-code-frame [data-ib-line="hl"] { background:color-mix(in srgb, var(--rd-accent) 16%, transparent) !important; }
    .ib-code-frame.is-folded > pre { max-height:420px; overflow:hidden; }
    .ib-code-more { display:none; }
    .ib-code-frame.is-folded .ib-code-more { position:absolute; left:0; right:0; bottom:0; display:block; padding:40px 0 10px; border:0; color:var(--rd-text-accent); background:linear-gradient(transparent, var(--rd-bg-code) 70%); font:inherit; font-size:13px; cursor:pointer; }

    @media (max-width:760px) {
      .ib-reader-header { gap:4px; }
      .ib-reader-button[data-action="font"] { display:none; }
      .ib-dock { right:12px; bottom:calc(12px + env(safe-area-inset-bottom)); }
      .ib-viewer { grid-template-columns:0 minmax(0,1fr) 0; }
      .ib-viewer-nav { display:none; }
    }
    @media (prefers-reduced-motion: reduce) { [data-ib-chapter-rail], .ib-cover-ambient, .ib-cover-watermark { display:none !important; } }
    @media print {
      [data-ib-chapter-rail], .ib-cover-ambient, .ib-cover-watermark { display:none !important; }
      [data-ib-chapter] { box-shadow:none !important; }
      *, *::before, *::after { animation:none !important; transition:none !important; }
      .ib-reader-header, .ib-reader-toc, .ib-dock, .ib-zen-exit, .ib-font-menu, .ib-viewer, .ib-tool, .ib-code-more { display:none !important; }
      .ib-table-frame.is-frozen tr > :first-child,
      .ib-table-frame.is-full :is(thead th, tr:first-child > th) { position:static !important; box-shadow:none; }
      .ib-table-scroll { overflow:visible; }
      .ib-table-scroll > table { table-layout:fixed !important; width:100% !important; max-width:100% !important; min-width:0 !important; }
      .ib-table-scroll :is(th,td) { white-space:normal !important; min-width:0 !important; overflow-wrap:anywhere; }
      .ib-code-frame.is-folded > pre { max-height:none; }
      .ib-reader-layout { display:block !important; }
    }
  `;
}

export function readerAppScript() {
  return `(()=>{
    const shell=document.querySelector('.ib-reader');
    const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
    const preferencePrefix='ib-reader-'+(shell.dataset.preferenceId?shell.dataset.preferenceId+'-':'');
    const store={get(k){try{return localStorage.getItem(preferencePrefix+k)}catch(_){return null}},set(k,v){try{localStorage.setItem(preferencePrefix+k,v)}catch(_){}}};
    const narrow=()=>matchMedia('(max-width:760px)').matches;

    // Keep the exported appearance unless the reader has a saved manual choice.
    // System appearance is only a fallback for documents without a valid mode.
    const savedTheme=store.get('theme');
    if(savedTheme==='light'||savedTheme==='dark') shell.dataset.theme=savedTheme;
    else if(shell.dataset.theme!=='light'&&shell.dataset.theme!=='dark') shell.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    const syncRoot=()=>{const root=document.documentElement;if(root)root.dataset.ibTheme=shell.dataset.theme;};syncRoot();
    const toggleTheme=()=>{shell.dataset.theme=shell.dataset.theme==='dark'?'light':'dark';store.set('theme',shell.dataset.theme);syncRoot();};
    $('[data-action="theme"]').addEventListener('click',toggleTheme);

    // Back is meaningful only in a standalone reader with earlier history.
    const backButton=$('[data-action="back"]');
    if(backButton){backButton.disabled=window.top!==window||history.length<=1;backButton.addEventListener('click',()=>{if(!backButton.disabled)history.back();});}

    // Navigation center.
    const navButton=$('[data-action="toc"]');
    navButton.setAttribute('aria-controls','ib-reader-navigation');
    const syncNavExpanded=()=>navButton.setAttribute('aria-expanded',String(narrow()?shell.classList.contains('ib-reader-toc-open'):!shell.classList.contains('ib-reader-toc-hidden')));
    syncNavExpanded();
    matchMedia('(max-width:760px)').addEventListener('change',syncNavExpanded);
    const toggleNav=force=>{if(narrow()){shell.classList.toggle('ib-reader-toc-open',force);}else{shell.classList.toggle('ib-reader-toc-hidden',force===undefined?undefined:!force);}syncNavExpanded();};
    navButton.addEventListener('click',()=>toggleNav());
    const tabs=$$('.ib-nav-tab'), panels=$$('.ib-nav-panel'), filter=$('.ib-nav-search input'), none=$('.ib-nav-none');
    const applyFilter=()=>{const q=filter.value.trim().toLowerCase();const panel=panels.find(p=>!p.hidden);let shown=0;panel?.querySelectorAll('a').forEach(a=>{const hit=!q||a.textContent.toLowerCase().includes(q);a.toggleAttribute('data-filtered-out',!hit);if(hit)shown++;});none.hidden=!q||shown>0;current=-2;update();};
    tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(t=>t.setAttribute('aria-selected',String(t===tab)));panels.forEach(p=>p.hidden=p.dataset.panel!==tab.dataset.tab);applyFilter();}));
    filter.addEventListener('input',applyFilter);
    $('.ib-reader-toc').addEventListener('click',e=>{if(e.target.closest('a')&&narrow())toggleNav(false);});
    // srcdoc inherits the host base URL: native fragment navigation can
    // leave the preview. Resolve known document targets inside the reader.
    document.addEventListener('click',e=>{
      const link=e.target.closest('a[href^="#"]');if(!link)return;
      let id;try{id=decodeURIComponent(link.getAttribute('href').slice(1));}catch(_){return;}
      const target=document.getElementById(id);if(!target)return;
      e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    });

    // Current chapter, progress, dock.
    const headings=$$('.ib-reader-note [data-reader-section]');
    const tocLinks=$$('.ib-nav-panel[data-panel="toc"] a');
    const tocIndicator=$('.ib-toc-indicator');
    let tocInitialized=false;
    const chapter=$('.ib-reader-chapter'), bar=$('.ib-reader-progress span');
    const prevBtn=$('[data-action="prev-chapter"]'), nextBtn=$('[data-action="next-chapter"]');
    let current=-1;
    // Heading offsets are measured once (and again when the article resizes);
    // scrolling only binary-searches them, never reading layout per frame.
    let offsets=[];const measure=()=>{offsets=headings.map(h=>h.getBoundingClientRect().top+scrollY);};measure();
    const locate=()=>{const y=scrollY+90;let lo=0,hi=offsets.length-1,index=offsets.length?0:-1;while(lo<=hi){const mid=(lo+hi)>>1;if(offsets[mid]<=y){index=mid;lo=mid+1;}else hi=mid-1;}return index;};
    let remeasure=0;if('ResizeObserver' in window)new ResizeObserver(()=>{clearTimeout(remeasure);remeasure=setTimeout(()=>{measure();current=-2;update();},150);}).observe(document.querySelector('.ib-reader-note'));
    const update=()=>{
      const max=document.documentElement.scrollHeight-innerHeight;
      bar.style.transform='scaleX('+(max>0?Math.min(1,scrollY/max):0)+')';
      shell.classList.toggle('ib-scrolled',scrollY>240);
      const index=locate();
      if(index!==current){current=index;chapter.textContent=index>=0?headings[index].textContent.trim():'';
        tocLinks.forEach((a,i)=>a.toggleAttribute('aria-current',i===index));if(index>=0)tocLinks[index]?.setAttribute('aria-current','location');
        // Keep the active entry visible inside the aside only (never scroll the page).
        const link=tocLinks[index], aside=$('.ib-reader-toc'), head=$('.ib-nav-head');
        if(tocIndicator){tocIndicator.hidden=!link||link.hasAttribute('data-filtered-out');if(link){tocIndicator.style.transform='translateY('+(link.offsetTop+(link.offsetHeight-34)/2)+'px)';if(!tocInitialized){tocInitialized=true;requestAnimationFrame(()=>tocIndicator.classList.add('is-ready'));}}}
        if(link&&!link.closest('[hidden]')){const a=aside.getBoundingClientRect(),r=link.getBoundingClientRect(),top=a.top+(head?.offsetHeight||0);if(r.top<top)aside.scrollTop-=top-r.top+8;else if(r.bottom>a.bottom)aside.scrollTop+=r.bottom-a.bottom+8;}}
      prevBtn.disabled=current<=0&&scrollY<8; nextBtn.disabled=current>=headings.length-1;
    };
    let ticking=false;addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(()=>{ticking=false;update();});}},{passive:true});
    addEventListener('resize',update);update();
    const go=index=>{const target=headings[Math.max(0,Math.min(headings.length-1,index))];if(target)target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};
    prevBtn.addEventListener('click',()=>{const top=headings[current]?.getBoundingClientRect().top;go(top!==undefined&&top<-20?current:current-1);});
    nextBtn.addEventListener('click',()=>go(current+1));
    $('[data-action="top"]').addEventListener('click',()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));

    // Width (remembered).
    const widthSelect=$('.ib-reader-width');
    const applyWidth=v=>{shell.dataset.width=v;widthSelect.value=v;};
    const savedWidth=store.get('width');if(savedWidth)applyWidth(savedWidth);
    widthSelect.addEventListener('change',()=>{applyWidth(widthSelect.value);store.set('width',widthSelect.value);});

    // Zen view.
    const zenButtons=$$('[data-action="zen"]');
    const setZen=on=>{shell.classList.toggle('ib-zen',on);zenButtons.forEach(b=>b.setAttribute('aria-pressed',String(on)));};
    zenButtons.forEach(b=>b.addEventListener('click',()=>setZen(!shell.classList.contains('ib-zen'))));

    // Font style (remembered).
    const fontMenu=$('.ib-font-menu'), fontButton=$('[data-action="font"]');
    const applyFont=v=>{shell.dataset.font=v;fontMenu.querySelectorAll('[data-font]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.font===v)));};
    applyFont(store.get('font')||'theme');
    const closeFont=()=>{fontMenu.hidden=true;};
    const openFont=()=>{const r=fontButton.getBoundingClientRect();fontMenu.hidden=false;fontMenu.style.top=(r.bottom+6)+'px';fontMenu.style.left=Math.max(8,Math.min(innerWidth-fontMenu.offsetWidth-8,r.right-fontMenu.offsetWidth))+'px';};
    fontButton.addEventListener('click',e=>{e.stopPropagation();fontMenu.hidden?openFont():closeFont();});
    fontMenu.addEventListener('click',e=>{const b=e.target.closest('[data-font]');if(!b)return;applyFont(b.dataset.font);store.set('font',b.dataset.font);closeFont();});
    document.addEventListener('click',e=>{if(!fontMenu.hidden&&!e.target.closest('.ib-font-menu'))closeFont();});

    // Image viewer.
    const images=$$('.ib-reader-note img[data-reader-image]');
    const viewer=$('.ib-viewer'), stage=$('.ib-viewer-stage'), big=document.createElement('img');stage.appendChild(big);
    const count=$('.ib-viewer-count'), caption=$('.ib-viewer-caption');
    const vPrev=viewer.querySelector('[data-viewer="prev"]'), vNext=viewer.querySelector('[data-viewer="next"]');
    let at=0;
    const labelOf=img=>img.alt||(img.closest('p')?.nextElementSibling?.tagName==='P'&&img.closest('p').nextElementSibling.textContent.trim().length<=80?img.closest('p').nextElementSibling.textContent.trim():'');
    const show=i=>{at=(i+images.length)%images.length;const img=images[at];big.src=img.currentSrc||img.src;big.alt=img.alt||'';stage.classList.remove('is-zoomed');count.textContent=(at+1)+' / '+images.length;caption.textContent=labelOf(img);vPrev.disabled=vNext.disabled=images.length<2;};
    const openViewer=i=>{show(i);viewer.hidden=false;document.documentElement.style.overflow='hidden';viewer.querySelector('[data-viewer="close"]').focus();};
    const closeViewer=()=>{viewer.hidden=true;document.documentElement.style.overflow='';images[at]?.focus?.();};
    images.forEach((img,i)=>{img.tabIndex=0;img.addEventListener('click',()=>openViewer(i));img.addEventListener('keydown',e=>{if(e.key==='Enter')openViewer(i);});});
    viewer.querySelector('[data-viewer="close"]').addEventListener('click',closeViewer);
    vPrev.addEventListener('click',()=>show(at-1));vNext.addEventListener('click',()=>show(at+1));
    stage.addEventListener('click',e=>{if(e.target===big)stage.classList.toggle('is-zoomed');else closeViewer();});
    let touchX=null;
    stage.addEventListener('touchstart',e=>{touchX=e.touches.length===1?e.touches[0].clientX:null;},{passive:true});
    stage.addEventListener('touchend',e=>{if(touchX===null||stage.classList.contains('is-zoomed'))return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50)show(at+(dx<0?1:-1));touchX=null;});

    // Offline callouts retain their initial state and use opacity-only motion.
    const calloutTimers=new WeakMap();
    $$('[data-ib-callout][data-ib-collapsed]').forEach(callout=>{const title=callout.querySelector('[data-ib-callout-title]');if(title){title.setAttribute('role','button');title.tabIndex=0;title.setAttribute('aria-expanded',String(callout.dataset.ibCollapsed!=='true'));}});
    const toggleCallout=title=>{
      const callout=title.closest('[data-ib-callout][data-ib-collapsed]'),content=callout?.querySelector('[data-ib-callout-content]');if(!content)return;
      clearTimeout(calloutTimers.get(content));
      const opening=callout.dataset.ibCollapsed==='true',opacity=content.checkVisibility()?getComputedStyle(content).opacity:'0';
      content.classList.remove('ib-callout-opening','ib-callout-closing');content.style.removeProperty('--ib-callout-opacity');
      callout.dataset.ibCollapsed=String(!opening);title.setAttribute('aria-expanded',String(opening));
      const value=getComputedStyle(content).getPropertyValue('--ib-dur-base').trim(),duration=value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches||!Number.isFinite(duration)||duration<=0)return;
      content.style.setProperty('--ib-callout-opacity',opacity);content.classList.add(opening?'ib-callout-opening':'ib-callout-closing');
      calloutTimers.set(content,setTimeout(()=>{content.classList.remove('ib-callout-opening','ib-callout-closing');content.style.removeProperty('--ib-callout-opacity');calloutTimers.delete(content);},duration));
    };
    document.addEventListener('click',e=>{const title=e.target.closest('[data-ib-callout][data-ib-collapsed] > [data-ib-callout-title]');if(title&&!e.target.closest('a,button,input,textarea,select'))toggleCallout(title);});
    document.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||e.target.closest('a,button,input,textarea,select'))return;const title=e.target.closest('[data-ib-callout][data-ib-collapsed] > [data-ib-callout-title]');if(title){e.preventDefault();toggleCallout(title);}});

    // Table and code tools.
    const copyFeedback=new WeakMap();
    let fullTable=null;
    const setFull=frame=>{if(fullTable&&fullTable!==frame){fullTable.classList.remove('is-full');fullTable.querySelector('[data-tool="full"]')?.setAttribute('aria-pressed','false');}fullTable=frame;document.documentElement.style.overflow=frame?'hidden':'';};
    document.addEventListener('click',async e=>{
      const button=e.target.closest('[data-tool]');if(!button)return;
      const frame=button.closest('.ib-table-frame,.ib-code-frame');const tool=button.dataset.tool;
      const toggle=cls=>{const on=frame.classList.toggle(cls);button.setAttribute('aria-pressed',String(on));return on;};
      // Pinned cells need an opaque fill; header colors often sit on the row or thead.
      const solidify=()=>{if(frame.dataset.solid)return;frame.dataset.solid='1';const clear=c=>!c||c==='transparent'||c.replace(/ /g,'').endsWith(',0)');
        frame.querySelectorAll('th, tr > :first-child').forEach(cell=>{if(!clear(getComputedStyle(cell).backgroundColor))return;for(let n=cell.parentElement;n&&n!==frame;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(!clear(c)){cell.style.backgroundColor=c;return;}}if(cell.tagName==='TH')cell.style.backgroundColor=getComputedStyle(frame).backgroundColor;});};
      if(tool==='freeze'||tool==='full')solidify();
      if(tool==='freeze')toggle('is-frozen');
      else if(tool==='wrap')toggle('is-nowrap');
      else if(tool==='full'){const on=toggle('is-full');setFull(on?frame:null);}
      else if(tool==='fold'){const folded=frame.classList.toggle('is-folded');if(folded)frame.scrollIntoView({block:'nearest'});}
      else if(tool==='copy'){const pre=frame.querySelector('pre'),text=(pre.querySelector('code')||pre).textContent;let ok=false;try{await navigator.clipboard.writeText(text);ok=true;}catch(_){const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;opacity:0;top:0;left:0';document.body.appendChild(area);area.focus();area.select();try{ok=document.execCommand('copy');}catch(__){}area.remove();}
        const previous=copyFeedback.get(button);if(previous)clearTimeout(previous.timer);
        const markup=previous?.markup??button.innerHTML,label=previous?previous.label:button.getAttribute('aria-label'),tip=previous?.tip??button.dataset.tip;
        button.classList.toggle('is-copied',ok);button.innerHTML=ok?${JSON.stringify(icon("check"))}:markup;button.dataset.tip=ok?'已复制':'复制失败';button.setAttribute('aria-label',button.dataset.tip);
        const timer=setTimeout(()=>{button.innerHTML=markup;button.dataset.tip=tip;if(label===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',label);button.classList.remove('is-copied');copyFeedback.delete(button);},1500);
        copyFeedback.set(button,{timer,markup,label,tip});}
    });

    // Tooltips: name and shortcut, for mouse users.
    const tip=document.createElement('div');tip.className='ib-tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);
    let tipFor=null,tipTimer=0;
    const hideTip=()=>{clearTimeout(tipTimer);tip.classList.remove('is-shown');tipFor=null;};
    document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const el=e.target.closest('[data-tip]');if(!el||el===tipFor)return;hideTip();tipFor=el;
      tipTimer=setTimeout(()=>{tip.textContent=el.dataset.tip;if(el.dataset.key){const k=document.createElement('kbd');k.textContent=el.dataset.key;tip.appendChild(k);}
        const r=el.getBoundingClientRect();tip.style.left='0px';tip.style.top='0px';tip.classList.add('is-shown');const w=tip.offsetWidth,h=tip.offsetHeight;
        let top=r.bottom+8;if(top+h>innerHeight-8)top=r.top-h-8;tip.style.top=top+'px';tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';},350);});
    document.addEventListener('pointerout',e=>{if(tipFor&&!tipFor.contains(e.relatedTarget))hideTip();});
    addEventListener('scroll',hideTip,{passive:true});document.addEventListener('pointerdown',hideTip);

    // Old independently styled skins no longer override the exported theme.
    shell.dataset.skin='theme';

    // Right rail: the current chapter's sections.
    const rail=$('.ib-rail'), railList=$('.ib-rail-list');
    const wideRail=matchMedia('(min-width:1280px)');
    // Same estimate as the cover's "约 N 分钟"; raw textContent would also count code, diagrams and hidden sources.
    const totalMinutes=Number(document.querySelector('.ib-cover')?.dataset.minutes)||Math.max(1,Math.round((document.querySelector('.ib-reader-note').textContent||'').replace(/\\s+/g,'').length/400));
    const levelOf=h=>Number(h.tagName.slice(1));
    const topLevel=headings.length?Math.min(...headings.map(levelOf)):2;
    let railChapter=-2;
    const renderRail=()=>{
      if(!rail||!wideRail.matches)return;
      let chapter=-1;for(let i=0;i<=current&&i<headings.length;i++)if(levelOf(headings[i])===topLevel)chapter=i;
      if(chapter!==railChapter){railChapter=chapter;railList.replaceChildren();
        const start=chapter<0?0:chapter+1;const base=chapter<0?topLevel:topLevel+1;
        for(let i=start;i<headings.length;i++){const h=headings[i];const l=levelOf(h);if(chapter>=0&&l<=topLevel)break;if(l>base+1)continue;
          const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent.trim();a.dataset.index=String(i);if(l>base)a.dataset.level='deeper';railList.appendChild(a);}
        $('.ib-rail-title').textContent=chapter>=0?headings[chapter].textContent.trim():'本章目录';}
      railList.querySelectorAll('a').forEach(a=>a.setAttribute('aria-current',String(Number(a.dataset.index)===current)));
      const max=document.documentElement.scrollHeight-innerHeight;const pct=max>0?Math.round(Math.min(1,scrollY/max)*100):100;
      rail.querySelector('.ib-rail-progress b').textContent=pct+'%';rail.querySelector('.ib-rail-bar span').style.transform='scaleX('+pct/100+')';
      const left=Math.max(0,Math.round(totalMinutes*(1-pct/100)));
      rail.querySelector('.ib-rail-left').textContent=left>0?'剩余约 '+left+' 分钟':'即将读完';
      rail.querySelector('[data-action="prev-section"]').disabled=current<=0;rail.querySelector('[data-action="next-section"]').disabled=current>=headings.length-1;
    };
    if(rail){rail.querySelector('[data-action="prev-section"]').addEventListener('click',()=>go(current-1));rail.querySelector('[data-action="next-section"]').addEventListener('click',()=>go(current+1));
      let railTick=false;addEventListener('scroll',()=>{if(!railTick){railTick=true;requestAnimationFrame(()=>{railTick=false;renderRail();});}},{passive:true});addEventListener('resize',()=>{railChapter=-2;renderRail();});wideRail.addEventListener?.('change',()=>{railChapter=-2;renderRail();});renderRail();}

    // Keys.
    document.addEventListener('keydown',e=>{
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(fullTable&&e.key==='Escape'){fullTable.querySelector('[data-tool="full"]').click();return;}
      if(!viewer.hidden){if(e.key==='Escape')closeViewer();else if(e.key==='ArrowLeft')show(at-1);else if(e.key==='ArrowRight')show(at+1);return;}
      if(e.target.closest('input,select,textarea'))return;
      const k=e.key.toLowerCase();
      if(k==='o'){toggleNav();}
      else if(k==='z'){setZen(!shell.classList.contains('ib-zen'));}
      else if(k==='d'){toggleTheme();}
      else if(k==='f'){fontMenu.hidden?openFont():closeFont();}
      else if(k==='['){prevBtn.click();}
      else if(k===']'){nextBtn.click();}
      else if(k==='/'){e.preventDefault();toggleNav(true);filter.focus();}
      else if(e.key==='Escape'){closeFont();if(shell.classList.contains('ib-zen'))setZen(false);else toggleNav(false);}
    });
  })();`;
}
