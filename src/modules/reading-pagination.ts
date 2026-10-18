import type { MarkdownPreviewView, TFile, View } from "obsidian";
import type { RenderingContext, PageState } from "../rendering-context.js";
import { Component, Notice, MarkdownView } from "obsidian";
import { waitForStableLayout } from "./layout-stability.js";
import { createIsolatedStaging, stagingStyleSheet } from "./isolated-staging.js";
import { PAGE_NUMBER_FORMATS } from "./page-numbers.js";
import { addPageFooters } from "./page-footer.js";
import { enhanceStaged } from "./staged-enhance.js";
import { nextFrame } from "./layout-frame.js";
import { firstScreenSource } from "./first-screen-source.js";
import { renderBudget } from "./render-budget.js";
import { paginateStrip as paginateStripCoordinates, paginationElements } from "./pagination.js";
import { preparePaperTableColumns } from "./paper-table-columns.js";
import { renderMarkdownWithContainers } from "./containers.js";
import { applyCodeFenceHighlights } from "./code-lines.js";
import { TASK_LINE, sourceTaskLines } from "./task-lines.js";

/* A paged book replaces the native reading view. The preview carries `ibp-has-book`; the reading view and the leaf
   carry `ibp-book-host`, so the theme can style around it without `:has()`. */
function setBookFlag(preview: HTMLElement, on: boolean) {
  preview.toggleClass("ibp-has-book", on);
  for (const host of [preview.closest(".markdown-reading-view"), preview.closest(".workspace-leaf-content")]) host?.toggleClass("ibp-book-host", on);
  if (!on) preview.removeClass("ib-has-pages");
}

// Last composed book per reading view; reused when only some blocks changed.
interface BookState {
  key?: string | null;
  component?: Component;
  book?: HTMLElement;
  staging?: HTMLElement | null;
  filePath?: string;
  renderSignature?: string;
  blockSignatures?: number[];
  pageRanges?: { start: number; end: number }[];
  pages?: HTMLElement[];
}
/* One measured top-level block of the staged note, in strip coordinates. */
interface PageBlock {
  el: HTMLElement;
  table: HTMLElement | null;
  chapter: { element: HTMLElement; top: number; bottom: number; left: number; right: number; tone: string } | null;
  top: number;
  bottom: number;
  layoutTop: number | undefined;
  layoutBottom: number | undefined;
  renderTop: number;
  renderBottom: number;
  tableRows: { top: number; bottom: number; header: boolean }[];
  continuationOverhead: number;
}
const books = new WeakMap<View, BookState>();
const interactiveBooks = new WeakSet<HTMLElement>();

/* A reading view carrying the re-render request flag this module sets on it. */
type PagedView = MarkdownView & { ibpRerender?: boolean };

function stripFrontmatter(text: string) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function annotateTaskCheckboxes(staging: HTMLElement, text: string) {
  const checkboxes = [...staging.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")];
  const tasks = sourceTaskLines(text);
  if (checkboxes.length !== tasks.length) {
    // A mismatched source/render order must not turn a different task in the file.
    checkboxes.forEach(input => {
      input.disabled = true;
      input.title = "当前分页无法定位此任务，请在无分页阅读模式中修改";
    });
    return;
  }
  checkboxes.forEach((input, index) => {
    input.dataset.ibpTaskLine = String(tasks[index].index);
    input.dataset.ibpTaskSource = tasks[index].line;
  });
}

function setTaskCloneState(inputs: HTMLInputElement[], checked: boolean) {
  for (const input of inputs) {
    input.checked = checked;
    const item = input.closest<HTMLElement>("li.task-list-item");
    item?.toggleClass("is-checked", checked);
    if (item) item.dataset.task = checked ? "x" : " ";
  }
}

function findBookAnchor(book: HTMLElement, target: string) {
  if (!target.startsWith("#")) return null;
  let fragment = target.slice(1);
  try { fragment = decodeURIComponent(fragment); } catch { /* keep the raw fragment when it is not valid percent-encoding */ }
  if (!fragment || fragment.startsWith("^")) return null;
  return [...book.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")]
    .find(heading => heading.dataset.heading === fragment || (heading.textContent || "").trim() === fragment || heading.id === fragment)
    || [...book.querySelectorAll<HTMLElement>("[id]")].find(element => element.id === fragment)
    || null;
}

function installBookInteractions(plugin: RenderingContext, view: MarkdownView, book: HTMLElement) {
  if (interactiveBooks.has(book)) return;
  interactiveBooks.add(book);
  const pendingTasks = new Set<string>();
  book.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest<HTMLElement>("a.internal-link, a.ibm-toc-link") : null;
    if (!link || !book.contains(link)) return;
    const target = link.dataset.href || link.getAttribute("href");
    const file = view.file;
    if (!target || !file || file.path !== book.dataset.ibpSourcePath) return;
    event.preventDefault();
    event.stopPropagation();
    const localAnchor = findBookAnchor(book, target);
    if (localAnchor) {
      localAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const workspace = plugin.app.workspace;
    const modifiedClick = event.metaKey || event.ctrlKey;
    const existingLeaves = new Set(workspace.getLeavesOfType("markdown"));
    void (async () => {
      await workspace.openLinkText(target, file.path, modifiedClick);
      if (modifiedClick) return;
      const destination = plugin.app.metadataCache.getFirstLinkpathDest(target, file.path);
      if (!destination || workspace.getActiveViewOfType(MarkdownView)?.file?.path === destination.path) return;
      const leaves = workspace.getLeavesOfType("markdown");
      const opened = leaves.find(leaf => !existingLeaves.has(leaf) && (leaf.view as MarkdownView).file?.path === destination.path)
        || leaves.find(leaf => (leaf.view as MarkdownView).file?.path === destination.path);
      if (opened) workspace.setActiveLeaf(opened, { focus: true });
    })().catch(error => console.error("Ignorance Advanced: paged link failed —", error));
  });
  book.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(".task-list-item-checkbox")) return;
    const file = view.file;
    const lineIndex = Number(input.dataset.ibpTaskLine);
    const sourceLine = input.dataset.ibpTaskSource;
    const sourceMatch = sourceLine?.match(TASK_LINE);
    if (!file || file.path !== book.dataset.ibpSourcePath || !Number.isInteger(lineIndex) || lineIndex < 0 || !sourceMatch) {
      input.checked = !input.checked;
      return;
    }
    const originalChecked = sourceMatch[2].toLowerCase() === "x";
    const wanted = input.checked;
    const copies = [...book.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")]
      .filter(candidate => candidate.dataset.ibpTaskLine === String(lineIndex) && candidate.dataset.ibpTaskSource === sourceLine);
    const key = `${file.path}:${lineIndex}`;
    if (pendingTasks.has(key)) return;
    pendingTasks.add(key);
    setTaskCloneState(copies, wanted);
    copies.forEach(candidate => { candidate.disabled = true; });
    void (async () => {
      try {
        const current = await plugin.app.vault.read(file);
        if (current.split("\n")[lineIndex] !== sourceLine) throw new Error("任务所在行已变化");
        await plugin.app.vault.process(file, data => {
          const lines = data.split("\n");
          if (lines[lineIndex] !== sourceLine) throw new Error("任务所在行已变化");
          lines[lineIndex] = `${sourceMatch[1]}${wanted ? "x" : " "}${sourceMatch[3]}`;
          return lines.join("\n");
        });
      } catch (error) {
        setTaskCloneState(copies, originalChecked);
        new Notice("任务状态未保存，请重试");
        console.error("Ignorance Advanced: paged task failed —", error);
        refreshBooks(plugin, true);
      } finally {
        pendingTasks.delete(key);
        copies.forEach(candidate => { candidate.disabled = false; });
      }
    })();
  });
}

/* Candidate cut positions inside a block (strip coordinates): bottoms of text
   lines, table rows and list items. */
const LINE_START_INSET = 2;

function breakPoints(block: HTMLElement, stripTop: number) {
  const points: number[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent || "").trim()) continue;
    range.selectNodeContents(node);
    // Cut just before a rendered line starts. A text range's bottom can differ
    // slightly from the glyph paint bounds in the positioned page clone.
    for (const rect of range.getClientRects()) points.push(rect.top - stripTop - LINE_START_INSET);
  }
  for (const el of block.querySelectorAll("tr, li, p, pre, img, svg")) points.push(el.getBoundingClientRect().bottom - stripTop);
  return points;
}

function paginateStrip(strip: HTMLDivElement, contentHeight: number, mode: string) {
  const stripRect = strip.getBoundingClientRect();
  const stripTop = stripRect.top;
  const chapterRects = new Map<HTMLElement, DOMRect>();
  const blocks = paginationElements(strip as { children: Iterable<HTMLElement> }).map((el): PageBlock => {
    const r = el.getBoundingClientRect();
    const chapterElement = el.closest<HTMLElement>("[data-ib-auto-chapter]");
    let chapterRect: DOMRect | null | undefined = chapterElement && chapterRects.get(chapterElement);
    if (chapterElement && !chapterRect) {
      chapterRect = chapterElement.getBoundingClientRect();
      chapterRects.set(chapterElement, chapterRect);
    }
    const chapter = chapterElement && chapterRect ? {
      element: chapterElement, top: chapterRect.top - stripTop,
      bottom: chapterRect.bottom - stripTop,
      left: r.left - stripRect.left, right: stripRect.right - r.right,
      tone: chapterElement.dataset.ibcTone || "0"
    } : null;
    const table = el.matches("table") ? el : el.querySelector("table");
    const tableHeader = table?.querySelector("thead");
    const tableCaption = table?.querySelector(":scope > caption");
    return {
      el, table, chapter, top: r.top - stripTop, bottom: r.bottom - stripTop,
      layoutTop: undefined, layoutBottom: undefined,
      renderTop: r.top - stripTop, renderBottom: r.bottom - stripTop,
      tableRows: table ? [...table.querySelectorAll("tr")].map(row => {
        const rowRect = row.getBoundingClientRect();
        return {
          top: rowRect.top - stripTop,
          bottom: rowRect.bottom - stripTop,
          header: Boolean(row.closest("thead"))
        };
      }) : [],
      continuationOverhead: (tableHeader?.getBoundingClientRect().height || 0) + (tableCaption?.getBoundingClientRect().height || 0)
    };
  }).filter(block => block.bottom > block.top);
  // Include card padding in page windows while retaining the measured text
  // position. Children remain separate blocks for heading/table break logic.
  const chapterBlocks = new Map<HTMLElement, typeof blocks>();
  for (const block of blocks) if (block.chapter) {
    const list = chapterBlocks.get(block.chapter.element) || [];
    list.push(block); chapterBlocks.set(block.chapter.element, list);
  }
  for (const list of chapterBlocks.values()) {
    const chapter = list[0].chapter;
    if (!chapter) continue;
    list[0].layoutTop = chapter.top;
    list[list.length - 1].layoutBottom = chapter.bottom;
  }
  const coordinates = blocks.map(block => ({
    top: block.layoutTop ?? block.top,
    bottom: block.layoutBottom ?? block.bottom,
    breakpoints: block.table
      ? block.tableRows.map(row => row.bottom)
      : breakPoints(block.el, stripTop),
    continuationOverhead: block.continuationOverhead,
    atomic: Boolean(block.el.matches(".mermaid, .math-block, .math, mjx-container, figure, .internal-embed, .image-embed, svg, img")
      || (block.el.matches("p") && (block.el.textContent || "").trim() === "" && block.el.querySelector("img, svg"))),
    leadIn: /^H[1-6]$/.test(block.el.tagName) || (block.el.tagName === "P" && /[:：]\s*$/.test(block.el.textContent || ""))
  }));
  return { blocks, windows: paginateStripCoordinates(coordinates, contentHeight, mode) };
}

const rendering = new WeakSet<View>();
const readingControllers = new WeakMap<View, AbortController>();

async function renderBook(plugin: RenderingContext, view: PagedView) {
  // One render per view at a time; a request arriving mid-render re-runs once
  // it finishes, so the latest settings and text always win.
  if (rendering.has(view)) { view.ibpRerender = true; return; }
  rendering.add(view);
  try {
    await renderBookOnce(plugin, view);
  } finally {
    rendering.delete(view);
  }
  if (view.ibpRerender) {
    view.ibpRerender = false;
    await renderBook(plugin, view);
  }
}

async function renderBookOnce(plugin: RenderingContext, view: PagedView) {
  if (!plugin.state.page.paged || !view.containerEl.isConnected) return;
  const page = plugin.state.page;
  const preview = view.containerEl.querySelector<HTMLElement>(".markdown-reading-view .markdown-preview-view");
  if (!preview || !view.file) return;
  const previous: BookState = books.get(view) || {};
  const text = await plugin.app.vault.cachedRead(view.file);
  if (!plugin.state.page.paged || !view.containerEl.isConnected) return;
  // A [toc] block is built from the metadata cache, which can lag behind the text (a note just
  // created or edited); keying on its headings re-lays the book out once the cache catches up.
  const tocHeadings = /^\s*(?:\[toc\]|\[\[toc\]\])\s*$/im.test(text)
    ? (plugin.app.metadataCache.getFileCache(view.file)?.headings || []).map(h => `${h.level}${h.heading}`).join("\n")
    : "";
  const key = [view.file.path, text.length, hashText(text), JSON.stringify(page), document.body.className.includes("theme-dark"), hashText(tocHeadings)].join("|");
  if (previous.key === key && previous.book?.isConnected) return;

  const component = new Component();
  component.load();
  const book = previous.book?.isConnected ? previous.book : preview.createDiv({ cls: "ibp-book" });
  installBookInteractions(plugin, view, book);
  setBookFlag(preview, true);
  book.dataset.ibpProgress = previous.pages?.length ? "updating" : "initial";
  const controller = new AbortController();
  readingControllers.set(view, controller);
  try {
    const renderSignature = [JSON.stringify(page), document.body.className.includes("theme-dark")].join("|");
    const done = await composePages(plugin, view.file, text, book, component, { previous, showProgress: true, signal: controller.signal });
    // A setting change can remove the book while this asynchronous render is
    // still settling diagrams. Do not re-hide native reading after paging was
    // switched off, or retain a finished render belonging to a closed tab.
    if (!plugin.state.page.paged || !view.containerEl.isConnected) {
      component.unload();
      previous.component?.unload();
      book.remove();
      setBookFlag(preview, false);
      books.delete(view);
      return;
    }
    if (!done) {
      component.unload();
      book.remove();
      setBookFlag(preview, false);
      books.delete(view);
      return;
    }
    previous.component?.unload();
    books.set(view, {
      key, component, book, filePath: view.file.path, renderSignature,
      blockSignatures: done.blockSignatures, pageRanges: done.pageRanges, pages: done.pages
    });
    book.dataset.ibpProgress = "complete";
  } catch (error) {
    component.unload();
    if (controller.signal.aborted) {
      previous.component?.unload();
      book.remove();
      setBookFlag(preview, false);
      books.delete(view);
      return;
    }
    if (previous.pages?.length) book.dataset.ibpProgress = "complete";
    if (!previous.book?.isConnected) {
      book.remove();
      setBookFlag(preview, false);
    }
    throw error;
  } finally {
    if (readingControllers.get(view) === controller) readingControllers.delete(view);
  }
}

/* Render a note and lay it out as pages inside `book` (any container that
   inherits the --ibp-* page variables). Returns the staging strip when asked
   to keep it (long-image export), otherwise removes it. */
function pageBlockRanges(blocks: PageBlock[], windows: { start: number; stop: number }[]) {
  let start = 0;
  return windows.map(window => {
    while (start < blocks.length && blocks[start].bottom <= window.start + 0.5) start += 1;
    let end = start;
    while (end < blocks.length && blocks[end].top < window.stop - 0.5) end += 1;
    return { start, end: end - 1 };
  });
}

function pageBlockSignatures(blocks: { el: HTMLElement }[]) {
  return blocks.map(({ el }) => {
    // Renderer-generated SVG IDs change on each render. Strip identifiers so
    // an unchanged Mermaid block can participate in prefix-page reuse.
    const html = el.outerHTML
      .replace(/\s+id=(['"]).*?\1/g, "")
      .replace(/url\(#[-\w:.]+\)/g, "url(#diagram)")
      .replace(/href=(['"])#[-\w:.]+\1/g, 'href="#diagram"');
    return hashText(html);
  });
}

function reusablePagePrefix(previous: BookState, filePath: string, renderSignature: string, signatures: number[], ranges: { start: number; end: number }[], page: PageState) {
  if (previous.filePath !== filePath || previous.renderSignature !== renderSignature || !previous.pages?.length) return 0;
  const old = previous.blockSignatures || [];
  let common = 0;
  while (common < old.length && common < signatures.length && old[common] === signatures[common]) common += 1;
  const dirtyBlock = common;
  const pageFor = (pageRanges: { start: number; end: number }[], blockIndex: number) => {
    const index = pageRanges.findIndex(range => range.end >= blockIndex && range.start <= blockIndex);
    return index >= 0 ? index : Math.max(0, pageRanges.length - 1);
  };
  const oldPage = pageFor(previous.pageRanges || [], dirtyBlock);
  const newPage = pageFor(ranges, dirtyBlock);
  const prefix = Math.min(oldPage, newPage, previous.pages.length, ranges.length);
  if (page.pageNumberFormat === "total" && previous.pages.length !== ranges.length) return 0;
  return prefix;
}

function tableForClone(clone: HTMLElement) {
  return clone.matches("table") ? clone : clone.querySelector("table");
}

function retainTableRows(block: PageBlock, cloneTable: HTMLElement, start: number, stop: number, repeatHeader: boolean) {
  if (!block.table) return;
  const clonedRows = [...cloneTable.querySelectorAll("tr")];
  block.tableRows.forEach((row, index: number) => {
    if (repeatHeader && row.header) return;
    if (row.bottom <= start + 0.5 || row.top >= stop - 0.5) clonedRows[index]?.remove();
  });

  const firstRow = block.table.querySelector("tr");
  const sourceCells = firstRow ? [...firstRow.children] : [];
  if (sourceCells.length) {
    let columns = cloneTable.querySelector("colgroup");
    if (!columns) {
      columns = createEl("colgroup");
      cloneTable.insertBefore(columns, cloneTable.firstChild);
    }
    while (columns.children.length < sourceCells.length) columns.appendChild(createEl("col"));
    [...columns.children].slice(sourceCells.length).forEach(column => column.remove());
    sourceCells.forEach((cell, index) => { (columns.children[index] as HTMLElement).style.width = `${cell.getBoundingClientRect().width}px`; });
    cloneTable.style.width = `${block.table.getBoundingClientRect().width}px`;
    cloneTable.setCssStyles({ tableLayout: "fixed" });
  }
}

function makePage(blocks: PageBlock[], window: { start: number; stop: number }, index: number, total: number, page: PageState, contentHeight = window.stop - window.start) {
  const format = PAGE_NUMBER_FORMATS[page.pageNumberFormat] || PAGE_NUMBER_FORMATS.plain;
  const sheet = createDiv();
  sheet.className = "ibp-page";
  const body = createDiv();
  body.className = "ibp-page-body markdown-preview-view markdown-rendered";
  body.style.height = `${contentHeight}px`;
  const continuingTable = blocks.find(block => block.table && block.top < window.start - 0.5 && block.bottom > window.start + 0.5);
  const continuationOffset = continuingTable?.continuationOverhead || 0;
  const cardLayers = new Map<HTMLElement, HTMLElement>();
  for (const block of blocks) {
    const chapter = block.chapter;
    if (!chapter || cardLayers.has(chapter.element) || chapter.bottom <= window.start || chapter.top >= window.stop) continue;
    const card = createDiv();
    card.className = "ibc-container ibc-container--chapter";
    card.dataset.ibPagedChapter = "";
    card.dataset.ibcTone = chapter.tone;
    card.setAttribute("aria-hidden", "true");
    const shiftedTop = chapter.top + (continuingTable && chapter.top >= continuingTable.bottom - 0.5 ? continuationOffset : 0);
    const shiftedBottom = chapter.bottom + (continuingTable && chapter.bottom >= continuingTable.bottom - 0.5 ? continuationOffset : 0);
    Object.assign(card.style, { position: "absolute", left: "0", right: "0", padding: "0", margin: "0", pointerEvents: "none",
      top: `${Math.max(0, shiftedTop - window.start)}px`,
      height: `${Math.min(window.stop + continuationOffset, shiftedBottom) - Math.max(window.start, shiftedTop)}px` });
    body.appendChild(card);
    cardLayers.set(chapter.element, card);
  }
  for (const block of blocks) {
    if (block.bottom <= window.start + 0.5 || block.top >= window.stop - 0.5) continue;
    const clone = block.el.cloneNode(true) as HTMLElement;
    // Paper language labels are information, not disconnected rename buttons.
    clone.querySelectorAll<HTMLElement>('.ibm-block-label.is-editable').forEach((label) => {
      const text = createSpan();
      text.className = 'ibm-block-label';
      text.textContent = label.textContent;
      label.replaceWith(text);
    });
    if (block.table) {
      const cloneTable = tableForClone(clone);
      if (cloneTable) retainTableRows(block, cloneTable, window.start, window.stop, block === continuingTable);
    }
    clone.addClass("ibp-placed");
    const top = block === continuingTable
      ? 0
      : (block.renderTop ?? block.top) - window.start + (continuingTable && block.top >= continuingTable.bottom - 0.5 ? continuationOffset : 0);
    clone.style.top = `${top}px`;
    if (block.chapter) {
      clone.style.setProperty("left", `${block.chapter.left}px`, "important");
      clone.style.setProperty("right", `${block.chapter.right}px`, "important");
      clone.style.setProperty("width", `calc(100% - ${block.chapter.left + block.chapter.right}px)`, "important");
      clone.classList.add("ibp-no-min-width");
    }
    // Line-safe page windows can stop before the paper edge; clip their final text block there
    // so the remaining lines begin only on the next page.
    if (!block.table && (block.renderBottom ?? block.bottom) > window.stop + 0.5) {
      clone.style.clipPath = "inset(0px 0px " + ((block.renderBottom ?? block.bottom) - window.stop) + "px 0px)";
    }
    body.appendChild(clone);
  }
  sheet.appendChild(body);
  if (page.pageNumber !== "none") {
    const number = createDiv();
    number.className = "ibp-page-number";
    number.textContent = format(index + 1, total);
    sheet.appendChild(number);
  }
  return sheet;
}

/* 页眉 = the chapter a page belongs to: the H1/H2 that opens the page, else the
   last one before it. None on the first page, which usually carries the title. */
function addRunningHeaders(pages: HTMLElement[], page: PageState) {
  let current = "";
  pages.forEach((sheet, index: number) => {
    sheet.querySelector(":scope > .ibp-page-header")?.remove();
    const headings = [...sheet.querySelectorAll<HTMLElement>(".ibp-page-body :is(h1, h2)")];
    const top = (heading: HTMLElement) => parseFloat(heading.closest<HTMLElement>(".ibp-placed")?.style.top || "0");
    const opening = headings[0] && top(headings[0]) < 48 ? (headings[0].textContent || "").trim() : "";
    const label = opening || current;
    if (headings.length) current = (headings[headings.length - 1].textContent || "").trim();
    if (page.runningHeader !== "chapter" || index === 0 || !label) return;
    const header = createDiv();
    header.className = "ibp-page-header";
    header.textContent = label;
    sheet.appendChild(header);
  });
}

async function settleRenderRegion(root: HTMLElement, height: number, signal?: AbortSignal) {
  const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
  const top = root.getBoundingClientRect().top;
  const inside = (element: HTMLElement) => element.getBoundingClientRect().top < top + height;
  const images = [...root.querySelectorAll<HTMLImageElement>("img")].filter(inside);
  await Promise.all(images.map(img => img.complete ? null : new Promise<void>(resolve => {
    const timer = window.setTimeout(resolve, 2500);
    img.addEventListener("load", () => { window.clearTimeout(timer); resolve(); }, { once: true });
    img.addEventListener("error", () => { window.clearTimeout(timer); resolve(); }, { once: true });
  })));
  for (let i = 0; i < 20; i += 1) {
    const pending = [...root.querySelectorAll<HTMLElement>(".mermaid, pre.language-mermaid")].some(element => inside(element) && !element.querySelector("svg") && !/Error/.test(element.textContent || ""));
    if (!pending) break;
    await wait(100);
  }
  for (let i = 0; i < 80; i += 1) {
    const pending = [...root.querySelectorAll<HTMLElement>('.ib-echarts-block[data-ib-echarts-state="loading"]')].some(inside);
    if (!pending) break;
    await wait(100);
  }
  if (document.fonts?.status === "loading") await document.fonts.ready;
  await waitForStableLayout(() => [...root.children].filter(inside).reduce((max, element) => Math.max(max, element.getBoundingClientRect().bottom - top), 0), { signal });
}

interface ComposeOptions {
  keepStrip?: boolean;
  previous?: BookState;
  showProgress?: boolean;
  expandDetails?: boolean;
  onProgress?: ((info: { pages: HTMLElement[]; staging: HTMLElement; partial: boolean }) => unknown) | null;
  signal?: AbortSignal | null;
}

async function composePages(plugin: RenderingContext, file: TFile, text: string, book: HTMLElement, component: Component, { keepStrip = false, previous = {}, showProgress = false, expandDetails = false, onProgress = null, signal: requestedSignal }: ComposeOptions = {}) {
  const signal = requestedSignal ?? undefined;
  signal?.throwIfAborted();
  const page = plugin.state.page;
  // Measure in the same view context as the final pages so inherited note
  // typography (including the page zoom font size) matches the positioned clones.
  const stagingParent = book.parentElement || document.body;
  // Both strips measure the same render with the same stylesheet snapshot.
  const sheet = stagingStyleSheet(stagingParent.ownerDocument);
  let staging: HTMLDivElement | undefined;
  const measure = book.createDiv({ cls: "ibp-page" });
  const bodyBox = measure.createDiv({ cls: "ibp-page-body" }).getBoundingClientRect();
  measure.remove();
  if (!bodyBox.width || bodyBox.height < 50) return null;
  let completed = false;
  try {
    const early = !previous.pages?.length && (onProgress || showProgress);
    // First screen: lay out just the opening while the whole note renders.
    const opening = early ? firstScreenSource(stripFrontmatter(text), 1800) : null;
    if (opening) {
      const quickComponent = new Component();
      quickComponent.load();
      let quick: HTMLDivElement | undefined;
      try {
        quick = await createIsolatedStaging(plugin, stagingParent, quickComponent, signal, sheet);
        quick.style.width = `${bodyBox.width}px`;
        await renderMarkdownWithContainers(plugin, file.path, opening, quick, quickComponent);
        preparePaperTableColumns(quick);
        applyCodeFenceHighlights(quick, opening);
        signal?.throwIfAborted();
        // MarkdownRenderer has awaited its diagram post-processors already.
        // Export previews can paint text immediately while images settle later.
        if (!onProgress) await settleRenderRegion(quick, bodyBox.height * (showProgress ? 1 : 3), signal);
        else await nextFrame();
        await plugin.settleDiagramFits?.(quick, signal);
        const firstPass = paginateStrip(quick, bodyBox.height, page.breakMode);
        // The last window may be cut short by the opening's end; leave it out.
        // Only the first page can be visible before the opening is published.
        // Cloning two off-screen pages delays its first paint, especially with
        // a long generated TOC. The complete pass supplies every following page.
        const earlyCount = onProgress || showProgress ? 1 : Math.min(3, firstPass.windows.length - 1);
        if (earlyCount > 0 && !book.dataset.ibpProgress?.startsWith("complete")) {
          book.dataset.align = page.pageNumber;
          book.replaceChildren(...firstPass.windows.slice(0, earlyCount).map((window, index) => makePage(firstPass.blocks, window, index, earlyCount, page, bodyBox.height)));
          book.dataset.ibpSourcePath = file.path;
          book.dataset.ibpProgress = "partial";
          await onProgress?.({ pages: [...book.children] as HTMLElement[], staging: quick, partial: true });
          await nextFrame();
        }
      } finally {
        quick?.remove();
        quickComponent.unload();
      }
    }
    signal?.throwIfAborted();
    // Full-note isolation is needed only after the opening has been published.
    staging = await createIsolatedStaging(plugin, stagingParent, component, signal, sheet);
    staging.style.width = `${bodyBox.width}px`;
    await renderMarkdownWithContainers(plugin, file.path, stripFrontmatter(text), staging, component);
    enhanceStaged(plugin, staging, stripFrontmatter(text), file);
    preparePaperTableColumns(staging);
    // Static exports must measure expanded content before assigning page windows.
    if (expandDetails) {
      staging.querySelectorAll("details").forEach(element => { element.open = true; });
      // Print reveals collapsed callouts; measure their expanded content first.
      staging.querySelectorAll<HTMLElement>(".callout.is-collapsed").forEach(element => {
        element.classList.remove("is-collapsed");
        element.querySelector(".callout-title")?.setAttribute("aria-expanded", "true");
        const content = element.querySelector<HTMLElement>(".callout-content");
        if (content) {
          // Obsidian folds the content with an inline display: none.
          content.style.removeProperty("display");
          content.classList.add("ibp-callout-open");
        }
      });
    }
    signal?.throwIfAborted();
    if (showProgress) annotateTaskCheckboxes(staging, text);
    applyCodeFenceHighlights(staging, stripFrontmatter(text));
    // Give a long first render an early, stable viewport. Later pages are
    // filled after off-screen images and diagrams finish their layout.
    if (early && !opening) {
      await settleRenderRegion(staging, bodyBox.height * 3, signal);
      await plugin.settleDiagramFits?.(staging, signal);
      const firstPass = paginateStrip(staging, bodyBox.height, page.breakMode);
      const earlyCount = Math.min(3, firstPass.windows.length);
      if (earlyCount) {
        book.dataset.align = page.pageNumber;
        const earlyPages = firstPass.windows.slice(0, earlyCount).map((window, index) => makePage(firstPass.blocks, window, index, firstPass.windows.length, page, bodyBox.height));
        book.replaceChildren(...earlyPages);
        book.dataset.ibpSourcePath = file.path;
        book.dataset.ibpProgress = "partial";
        await nextFrame();
      }
    }
    await settleRender(staging, signal);
    await plugin.settleDiagramFits?.(staging, signal);
    const { blocks, windows } = paginateStrip(staging, bodyBox.height, page.breakMode);
    const signatures = pageBlockSignatures(blocks);
    const ranges = pageBlockRanges(blocks, windows);
    const renderSignature = [JSON.stringify(page), document.body.className.includes("theme-dark")].join("|");
    const reuseCount = reusablePagePrefix(previous, file.path, renderSignature, signatures, ranges, page);
    book.dataset.align = page.pageNumber;
    const pages = [...(previous.pages || []).slice(0, reuseCount)];
    const checkpoint = renderBudget(signal);
    for (let index = reuseCount; index < windows.length; index += 1) {
      await checkpoint();
      pages.push(makePage(blocks, windows[index], index, windows.length, page, bodyBox.height));
    }
    addRunningHeaders(pages, page);
    addPageFooters(pages, page.footerText, file.basename);
    // Replacing an edited page removes the browser's scroll anchor. Capture
    // the current viewport at publication time, after any user scroll during
    // asynchronous rendering, and restore it in the same frame.
    const scroller = showProgress && previous.pages?.length ? book.closest(".markdown-preview-view") : null;
    const scrollTop = scroller?.scrollTop;
    book.replaceChildren(...pages);
    if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
    if (showProgress) book.dataset.ibpSourcePath = file.path;
    if (showProgress) book.dataset.ibpProgress = "complete";
    completed = true;
    if (!keepStrip) staging.remove();
    return { pages, staging: keepStrip ? staging : null, blockSignatures: signatures, pageRanges: ranges };
  } finally {
    if (!completed) staging?.remove();
  }
}

function hashText(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

/* Mermaid and images finish after MarkdownRenderer resolves; wait for them
   so block heights are final before cutting pages. */
async function settleRender(root: HTMLElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const wait = async (ms: number) => {
    signal?.throwIfAborted();
    await new Promise(r => window.setTimeout(r, ms));
    signal?.throwIfAborted();
  };
  await Promise.all([...root.querySelectorAll<HTMLImageElement>("img")].map(img => img.complete ? null : new Promise<void>(resolve => {
    const done = () => { window.clearTimeout(timer); img.removeEventListener("load", done); img.removeEventListener("error", done); signal?.removeEventListener("abort", done); resolve(); };
    const timer = window.setTimeout(done, 2500);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    signal?.addEventListener("abort", done, { once: true });
  })));
  signal?.throwIfAborted();
  for (let i = 0; i < 40; i += 1) {
    const pending = [...root.querySelectorAll(".mermaid, pre.language-mermaid")].some(m => !m.querySelector("svg") && !/Error/.test(m.textContent || ""));
    if (!pending) break;
    await wait(150);
  }
  for (let i = 0; i < 80; i += 1) {
    const pending = root.querySelector('.ib-echarts-block[data-ib-echarts-state="loading"]');
    if (!pending) break;
    await wait(100);
  }
  // Diagram enhancement keeps resizing canvases for a while after the SVG
  // appears; measure only once the strip height has held still.
  let last = -1, still = 0;
  for (let i = 0; i < 40 && still < 3; i += 1) {
    await wait(200);
    const height = root.scrollHeight;
    still = Math.abs(height - last) < 1 ? still + 1 : 0;
    last = height;
  }
}

function refreshBooks(plugin: RenderingContext, force: boolean) {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view as MarkdownView;
    const state = books.get(view);
    const reading = view.getMode?.() === "preview";
    // Editing keeps the laid-out book (the reading view stays in the DOM,
    // hidden), so switching back shows it at once instead of paginating anew;
    // an edit changes the key and refreshes only the pages that changed.
    if (plugin.state.page.paged && !reading && state) {
      if (force) state.key = null;
      continue;
    }
    if (!plugin.state.page.paged || !reading) {
      const hadBook = !!state || !!view.containerEl.querySelector(".ibp-book, .ibp-has-book");
      readingControllers.get(view)?.abort();
      if (state) {
        state.component?.unload();
        state.book?.remove();
        state.staging?.remove();
        books.delete(view);
      }
      { const flagged = view.containerEl.querySelector<HTMLElement>(".ibp-has-book"); if (flagged) setBookFlag(flagged, false); }
      view.containerEl.querySelectorAll(".ibp-book").forEach(book => book.remove());
      // The hidden native renderer may have cached zero-height sections.
      // Once paging is off, invalidate those measurements and rendered blocks
      // so scrolling/jumping uses the real reading layout again.
      if (!plugin.state.page.paged && hadBook) (view.previewMode as MarkdownPreviewView & { renderer?: { rerender(full: boolean): void } })?.renderer?.rerender(true);
      continue;
    }
    // A hidden tab can keep a very large preview alive, but it is not visible
    // to the reader. Defer its pagination until the tab becomes active; this
    // prevents a page-setting change from rendering every large hidden note
    // at once and gives active-leaf-change a cheap hand-off point.
    if (view.containerEl.checkVisibility && !view.containerEl.checkVisibility()) {
      if (force && state) state.key = null;
      continue;
    }
    if (force && state) state.key = null;
    renderBook(plugin, view).catch(error => console.error("Ignorance Advanced: paged view failed —", error));
  }
}


export {
  books,
  annotateTaskCheckboxes,
  installBookInteractions,
  stripFrontmatter,
  paginationElements,
  breakPoints,
  paginateStrip,
  rendering,
  renderBook,
  renderBookOnce,
  pageBlockRanges,
  pageBlockSignatures,
  reusablePagePrefix,
  makePage,
  settleRenderRegion,
  firstScreenSource,
  composePages,
  hashText,
  settleRender,
  refreshBooks
};
