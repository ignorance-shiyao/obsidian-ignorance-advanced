import type { IgnorancePlugin } from "../plugin-types.js";
import { MarkdownView, Menu, Modal, Notice, TFile, requestUrl, setTooltip } from "obsidian";
import { EditorState, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { setIcon } from "./ui-icons.js";
import { IMAGE_FILTERS, hasImageKeyword, imageAlignment, imageFilter, imageLinkAt, withImageAlignment, withImageFilter, withImageKeyword, withoutImageWidth, withImageSize, withImageTarget, resizedImageBox } from "./image-align-core.js";
import { cropImage, canCrop } from "./image-crop.js";
import { keepViewport } from "./reading-position.js";


const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
const FILTER_LABELS: Record<string, string> = { gray: "灰度", sepia: "复古", invert: "反色", "dark-invert": "深色模式下反色", blur: "模糊（鼠标移上去恢复）" };
const LABELS: Array<[string, string, string]> = [["left", "左对齐", "lucide-align-left"], ["center", "居中", "lucide-align-center"], ["right", "右对齐", "lucide-align-right"]];

type ImageLink = NonNullable<ReturnType<typeof imageLinkAt>>;
interface FoundLink { link: ImageLink; apply: (insert: string) => void | Promise<unknown> }
// A resize handle carries its pointerdown starter so one document-level listener can dispatch to it.
interface ResizeHandle extends HTMLElement { __ibResizeStart?: (event: PointerEvent) => void }
// Reading view's rendered sections: private to Obsidian, only the parts used here.
interface RenderedSection { el?: HTMLElement; lines?: number }
function renderedSections(view: MarkdownView): RenderedSection[] {
  const mode: object | undefined = view.previewMode;
  const renderer: unknown = mode && "renderer" in mode ? mode.renderer : undefined;
  const sections: unknown = renderer && typeof renderer === "object" && "sections" in renderer ? renderer.sections : undefined;
  return Array.isArray(sections) ? sections as RenderedSection[] : [];
}

const errorText = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);

const markdownViews = (plugin: IgnorancePlugin) => plugin.app.workspace.getLeavesOfType("markdown")
  .map(leaf => leaf.view).filter((view): view is MarkdownView => view instanceof MarkdownView);

// Obsidian's image context menu is a file-menu without the clicked element,
// so remember which embed was right-clicked. Live Preview edits the link in
// the editor; reading view gets its own menu and rewrites the note on disk. Either way the viewport
// stays where it was.
export function installImageAlignment(plugin: IgnorancePlugin) {
  installImageToolbar(plugin);
  plugin.registerEditorExtension(keepAlignmentOnResize);
  let target: Element | null = null;
  plugin.registerDomEvent(document, "contextmenu", event => {
    target = event.target instanceof Element ? event.target.closest(".image-embed") : null;
    // Reading view has no image menu of its own; offer the alignment menu there.
    if (!target || !target.closest(".markdown-reading-view")) return;
    const view = markdownViews(plugin).find(view => view.file && view.containerEl.contains(target));
    const found = view && readingLink(view, target);
    if (!found) return;
    event.preventDefault();
    const menu = new Menu();
    addAlignItems(menu, view, found);
    menu.showAtMouseEvent(event);
  }, true);

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file, source) => {
    if (source !== "link-context-menu" || !IMAGE_EXTS.has((file instanceof TFile ? file.extension : "").toLowerCase()) || !target?.isConnected) return;
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const found = view?.file && view.getMode() !== "preview" ? editorLink(view.editor?.cm, target) : null;
    if (!found) return;
    menu.addSeparator();
    addAlignItems(menu, view, found);
  }));
}

function addAlignItems(menu: Menu, view: MarkdownView, found: FoundLink) {
  const current = imageAlignment(found.link);
  for (const [align, title, icon] of LABELS) {
    menu.addItem(item => item.setTitle(title).setIcon(icon).setChecked(current === align).setSection("ibp-image-align").onClick(() => {
      void keepViewport(view, () => found.apply(withImageAlignment(found.link, align)));
    }));
  }
}

function linksOnLine(text: string, offset: number) {
  const links: ImageLink[] = [];
  for (let index = text.indexOf("!["); index !== -1; index = text.indexOf("![", index + 1)) {
    const link = imageLinkAt(text, index);
    if (link) links.push({ ...link, from: offset + link.from, to: offset + link.to });
  }
  return links;
}

function editorLink(cm: EditorView | undefined, embed: Element): FoundLink | null {
  if (!cm || !cm.dom.contains(embed)) return null;
  let pos: number;
  try { pos = cm.posAtDOM(embed); } catch { return null; }
  const line = cm.state.doc.lineAt(pos);
  const links = linksOnLine(line.text, line.from);
  const link = links.find(link => pos >= link.from && pos <= link.to)
    || links.reduce<ImageLink | null>((best, link) => !best || Math.abs(link.from - pos) < Math.abs(best.from - pos) ? link : best, null);
  if (!link) return null;
  return { link, apply: (insert: string) => cm.dispatch({ changes: { from: link.from, to: link.to, insert }, userEvent: "input.ibp-image" }) };
}

// Reading view: the rendered section knows its source lines; pick the image
// link there by its position among the section's image embeds.
function readingLink(view: MarkdownView, embed: Element): FoundLink | null {
  // Rendered sections carry only their line counts, in source order.
  const sections = renderedSections(view);
  let lineStart = 0;
  const section = sections.find(section => {
    if (section.el?.contains(embed)) return true;
    lineStart += section.lines || 0;
    return false;
  });
  if (!section) return null;
  const lines = view.data.split("\n");
  const start = lines.slice(0, lineStart).reduce((sum: number, text: string) => sum + text.length + 1, 0);
  const text = lines.slice(lineStart, lineStart + Math.max(1, section.lines || 1)).join("\n");
  const links = linksOnLine(text, start);
  const embeds = [...(section.el?.querySelectorAll(".image-embed") ?? [])];
  const link = links[embeds.indexOf(embed)] || (links.length === 1 ? links[0] : null);
  if (!link) return null;
  const original = view.data.slice(link.from, link.to);
  return {
    link,
    apply: (insert: string) => view.app.vault.process(view.file, data =>
      data.slice(link.from, link.to) === original ? data.slice(0, link.from) + insert + data.slice(link.to) : data)
  };
}

/* Hover toolbar at the image's top-right corner: Obsidian's own edit
   action (proxied, so it keeps its behavior) plus copy, remove (confirmed),
   reset size and left / center / right. Styling lives in the theme. */
const TOOLBAR = "ib-image-actions";

function viewFor(plugin: IgnorancePlugin, el: HTMLElement) {
  return markdownViews(plugin).find(view => view.file && view.containerEl.contains(el)) || null;
}

function linkFor(view: MarkdownView | null, embed: Element): FoundLink | null {
  if (!view) return null;
  if (embed.closest(".markdown-reading-view")) return readingLink(view, embed);
  return editorLink(view.editor?.cm, embed);
}

async function copyImage(plugin: IgnorancePlugin, embed: HTMLElement) {
  const img = embed.querySelector("img");
  if (!img) return;
  try {
    const src = img.currentSrc || img.src;
    let buffer: ArrayBuffer;
    // Only vault embeds carry a link path; web images have none.
    const linkPath = embed.getAttribute("src");
    const local = linkPath ? plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(linkPath), viewFor(plugin, embed)?.file?.path || "") : null;
    if (local instanceof TFile && local.extension !== "md") buffer = await plugin.app.vault.readBinary(local);
    else buffer = await downloadImage(src);
    // The clipboard takes PNG; decode anything else (JPEG, WebP, AVIF, GIF, SVG…)
    // from the bytes themselves and re-encode it.
    const png = new Blob([await toPng(buffer)], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    new Notice("已复制图片");
  } catch (error) {
    console.error("Ignorance Advanced: copy image failed —", error);
    new Notice("复制图片失败");
  }
}

async function downloadImage(url: string) {
  const response = await requestUrl({ url, throw: false });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer;
}

async function toPng(buffer: ArrayBuffer) {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const canvas = createEl("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("unsupported image");
  return blob.arrayBuffer();
}

// Crop the vault image behind an embed. "New image" saves a copy and points this embed at it;
// "replace" overwrites the file, and the embeds refresh on their own.
function startCrop(plugin: IgnorancePlugin, embed: HTMLElement) {
  const view = viewFor(plugin, embed);
  const linkPath = embed.getAttribute("src");
  const file = linkPath ? plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(linkPath), view?.file?.path || "") : null;
  if (!(file instanceof TFile) || !IMAGE_EXTS.has(file.extension.toLowerCase())) { new Notice("只能裁切库内的图片"); return; }
  if (!canCrop(file)) { new Notice("暂不支持裁切这种格式（支持 PNG、JPG 和网页图片（扩展名 .webp））"); return; }
  void cropImage(plugin, file, ({ mode, file: result }) => {
    if (mode !== "new") return;
    const found = embed.isConnected ? linkFor(view, embed) : null;
    if (!found || !view?.file) { new Notice("已新增图片，但无法定位原链接，请手动引用"); return; }
    const target = plugin.app.metadataCache.fileToLinktext(result, view.file.path, false);
    void keepViewport(view, () => found.apply(withImageTarget(found.link, target)));
  });
}

function addButton(bar: HTMLElement, icon: string, label: string, run: (event: MouseEvent) => void, extraClass = "") {
  const button = bar.createDiv({ cls: `ib-image-action ${extraClass}`.trim() });
  setIcon(button, icon);
  setTooltip(button, label, { placement: "top" });
  button.setAttribute("aria-label", label);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    run(event);
  });
  return button;
}

function decorate(plugin: IgnorancePlugin, embed: HTMLElement) {
  const wrapper = embed.querySelector<HTMLElement>(":scope > .image-wrapper") || embed;
  if (wrapper.querySelector(`:scope > .${TOOLBAR}`)) return;
  if (embed.closest(".ibp-book, .ibp-staging, .ibp-export, .reveal")) return;
  installResizeHandles(plugin, embed, wrapper);
  const bar = wrapper.createDiv({ cls: TOOLBAR });
  // Keep the editor from selecting the widget (which would reveal the source).
  bar.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
  const native = (label: string) => embed.querySelector<HTMLElement>(`.embed-actions .embed-action${label}`);
  // Zoom stays on double-click; only the edit action is carried over.
  const edit = native(".edit-block-button");
  if (edit) addButton(bar, "lucide-code-xml", edit.getAttribute("aria-label") || "编辑源码", () => edit.click());
  addButton(bar, "lucide-copy", "复制图片", () => { void copyImage(plugin, embed); });
  addButton(bar, "lucide-crop", "裁切图片", () => startCrop(plugin, embed));
  const change = (make: (link: ImageLink) => string, label: string) => () => {
    const view = viewFor(plugin, embed);
    const found = linkFor(view, embed);
    if (!found) { new Notice(`无法定位图片链接，未${label}`); return; }
    void keepViewport(view, () => found.apply(make(found.link)));
  };
  // Filters and click-to-play are written into the link; this menu is the way to set them without the source.
  addButton(bar, "lucide-sparkles", "图片样式：滤镜、点击播放", (event: MouseEvent) => {
    const found = linkFor(viewFor(plugin, embed), embed);
    if (!found) { new Notice("无法定位图片链接"); return; }
    const now = imageFilter(found.link);
    const menu = new Menu();
    menu.addItem(item => item.setTitle("无滤镜").setChecked(!now).onClick(change(link => withImageFilter(link, null), "设置滤镜")));
    for (const filter of IMAGE_FILTERS) {
      menu.addItem(item => item.setTitle(FILTER_LABELS[filter]).setChecked(now === filter).onClick(change(link => withImageFilter(link, filter), "设置滤镜")));
    }
    if (/\.gif(?:$|[?#])/i.test(embed.getAttribute("src") || "")) {
      menu.addSeparator();
      const playing = hasImageKeyword(found.link, "click");
      menu.addItem(item => item.setTitle("GIF 点击后才播放").setChecked(playing).onClick(change(link => withImageKeyword(link, "click", !playing), "设置播放方式")));
    }
    menu.showAtMouseEvent(event);
  });
  addButton(bar, "lucide-rotate-ccw", "重置大小", change(withoutImageWidth, "重置大小"));
  const remove = change(() => "", "删除");
  addButton(bar, "lucide-trash-2", "删除图片", () => confirmRemoval(plugin, remove));
  bar.createDiv({ cls: "ib-image-action-divider" });
  const current = () => {
    const found = linkFor(viewFor(plugin, embed), embed);
    return found ? imageAlignment(found.link) : null;
  };
  const alignButtons = LABELS.map(([align, title, icon]) =>
    addButton(bar, icon, title, change(link => withImageAlignment(link, align), title), `ib-image-align-${align}`));
  bar.addEventListener("mouseenter", () => {
    const now = current();
    alignButtons.forEach((button, index) => button.toggleClass("is-active", LABELS[index][0] === now));
  });
}

function installImageToolbar(plugin: IgnorancePlugin) {
  // Handle the pointer before CodeMirror can select/rebuild the image widget.
  plugin.registerDomEvent(document, "pointerdown", event => {
    const handle = event.target instanceof Element ? event.target.closest<ResizeHandle>(".ib-image-resize-handle") : null;
    if (handle?.__ibResizeStart) handle.__ibResizeStart(event);
  }, true);
  const decorateWithin = (root: Node) => {
    if (!root.instanceOf(HTMLElement)) return;
    if (root.matches(".image-embed")) decorate(plugin, root);
    root.querySelectorAll<HTMLElement>(".image-embed").forEach(embed => decorate(plugin, embed));
  };
  const inMarkdown = (node: Node) => node.instanceOf(Element) && node.closest(".workspace-leaf-content[data-type='markdown']");
  // Only look at what was added, not the whole workspace on every change.
  let pending: Node[] = [];
  let scheduled = false;
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (inMarkdown(node)) pending.push(node);
    if (!pending.length || scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      const nodes = pending;
      pending = [];
      scheduled = false;
      nodes.forEach(decorateWithin);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // The image preview shown while editing a link sits outside the text
  // column; give the theme the column width so it can cap the image.
  const measureColumns = () => document.querySelectorAll<HTMLElement>(".workspace-leaf-content[data-type='markdown'] .cm-editor").forEach(editor => {
    const width = editor.querySelector(".cm-content")?.clientWidth;
    if (width) editor.style.setProperty("--ib-text-column", `${width}px`);
  });
  const refresh = () => window.requestAnimationFrame(measureColumns);
  plugin.registerEvent(plugin.app.workspace.on("resize", refresh));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", refresh));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", refresh));
  plugin.registerEvent(plugin.app.workspace.on("css-change", refresh));
  plugin.register(() => {
    observer.disconnect();
    document.querySelectorAll(`.${TOOLBAR}`).forEach(el => el.remove());
  });
  plugin.app.workspace.onLayoutReady(() => {
    document.querySelectorAll(".workspace-leaf-content[data-type='markdown']").forEach(decorateWithin);
    measureColumns();
  });
}

/* Obsidian's resize corner (and "reset size") rewrites the link by putting
   the width in its last segment, which would replace `left` / `right` in
   ![说明|left](a.png). Those writes carry no user event; put the keyword back. */
const keepAlignmentOnResize = EditorState.transactionFilter.of(tr => {
  if (!tr.docChanged || tr.annotation(Transaction.userEvent)) return tr;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let fixed = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    let insert = inserted.toString();
    const before = imageLinkAt(tr.startState.doc.sliceString(fromA, toA), 0);
    const after = imageLinkAt(insert, 0);
    if (before && after && before.to === toA - fromA && after.to === insert.length) {
      const align = imageAlignment(before);
      if (align !== "center" && imageAlignment(after) === "center") {
        insert = withImageAlignment(after, align);
        fixed = true;
      }
    }
    changes.push({ from: fromA, to: toA, insert });
  });
  if (!fixed) return tr;
  return { changes, effects: tr.effects, scrollIntoView: tr.scrollIntoView, annotations: Transaction.userEvent.of("input.ibp-image") };
});

// Removing the image link asks first; the image file itself is kept.
function confirmRemoval(plugin: IgnorancePlugin, remove: () => void) {
  const modal = new Modal(plugin.app);
  modal.titleEl.setText("删除图片");
  modal.contentEl.createEl("p", { text: "从笔记中移除这张图片？图片文件本身会保留。" });
  const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
  buttons.createEl("button", { text: "删除", cls: "mod-warning" }).addEventListener("click", () => { modal.close(); remove(); });
  buttons.createEl("button", { text: "取消" }).addEventListener("click", () => modal.close());
  modal.open();
}

function installResizeHandles(plugin: IgnorancePlugin, embed: HTMLElement, wrapper: HTMLElement) {
  const img = wrapper.querySelector("img");
  if (!img || wrapper.querySelector(".ib-image-resize-layer")) return;
  const layer = wrapper.createDiv({ cls: "ib-image-resize-layer" });
  const update = () => {
    const width = Number(img.getAttribute("width")), height = Number(img.getAttribute("height"));
    if (width > 0 && height > 0) { img.setCssStyles({ aspectRatio: `${width} / ${height}`, objectFit: "fill" }); img.dataset.ibExplicitRatio = "1"; }
    else if (img.dataset.ibExplicitRatio) {
      img.style.removeProperty("aspect-ratio"); img.style.removeProperty("object-fit");
      delete img.dataset.ibExplicitRatio;
    }
    const a = img.getBoundingClientRect(), b = wrapper.getBoundingClientRect();
    Object.assign(layer.style, { left: `${a.left - b.left}px`, top: `${a.top - b.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  };
  const observer = new ResizeObserver(update);
  observer.observe(img); observer.observe(wrapper);
  // Native reset can remove size attributes without replacing the image node.
  const sizeObserver = new MutationObserver(update);
  sizeObserver.observe(img, { attributes: true, attributeFilter: ["width", "height"] });
  let cancelDrag: (() => void) | null = null;
  for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const handle: ResizeHandle = layer.createEl("button", { cls: `ib-image-resize-handle is-${direction}`, attr: { type: "button", "aria-label": direction.length === 2 ? "等比例缩放图片" : "单方向缩放图片" } });
    handle.__ibResizeStart = event => {
      if (event.button !== 0) return;
      const view = viewFor(plugin, embed), found = linkFor(view, embed);
      if (!found) return;
      event.preventDefault(); event.stopPropagation();
      const rect = img.getBoundingClientRect();
      const previous = img.getAttribute("style");
      let next = { width: rect.width, height: rect.height }, moved = false;
      layer.classList.add("is-dragging");
      handle.setPointerCapture(event.pointerId);
      const restore = () => { if (previous === null) img.removeAttribute("style"); else img.setAttribute("style", previous); update(); };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        e.preventDefault(); e.stopPropagation();
        moved = true;
        next = resizedImageBox(rect.width, rect.height, e.clientX - event.clientX, e.clientY - event.clientY, direction);
        img.style.setProperty("width", `${next.width}px`, "important");
        img.style.setProperty("height", `${next.height}px`, "important");
        img.setCssStyles({ objectFit: "fill" });
        update();
      };
      const finish = (e: PointerEvent | null) => {
        if (e && e.pointerId !== event.pointerId) return;
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", finish, true);
        document.removeEventListener("pointercancel", finish, true);
        layer.classList.remove("is-dragging"); cancelDrag = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        void (async () => {
          let saved = false;
          try { if (moved && e?.type === "pointerup") {
            await keepViewport(view, () => found.apply(withImageSize(found.link, next.width, next.height)));
            saved = true;
          } }
          catch (error) { new Notice(`图片尺寸保存失败：${errorText(error)}`); }
          finally {
            if (saved) { img.style.removeProperty("width"); img.style.removeProperty("height"); update(); }
            else restore();
          }
        })();
      };
      cancelDrag = () => finish(null);
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", finish, true);
      document.addEventListener("pointercancel", finish, true);
    };
  }
  update();
  plugin.register(() => { cancelDrag?.(); observer.disconnect(); sizeObserver.disconnect(); layer.remove(); });
}
