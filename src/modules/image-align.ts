import { setIcon } from "./ui-icons.js";
import { imageAlignment, imageLinkAt, withImageAlignment, withoutImageWidth, withImageSize, withImageTarget, resizedImageBox } from "./image-align-core.js";
import { cropImage, canCrop } from "./image-crop.js";
import { keepViewport } from "./reading-position.js";

const { MarkdownView, Menu, Modal, Notice, TFile, requestUrl, setTooltip } = require("obsidian");
const { EditorState, Transaction } = require("@codemirror/state");

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
const LABELS = [["left", "左对齐", "lucide-align-left"], ["center", "居中", "lucide-align-center"], ["right", "右对齐", "lucide-align-right"]];

// Obsidian's image context menu is a file-menu without the clicked element,
// so remember which embed was right-clicked. Live Preview edits the link in
// the editor; reading view gets its own menu and rewrites the note on disk. Either way the viewport
// stays where it was.
export function installImageAlignment(plugin) {
  installImageToolbar(plugin);
  plugin.registerEditorExtension(keepAlignmentOnResize);
  let target = null;
  plugin.registerDomEvent(document, "contextmenu", event => {
    target = event.target instanceof Element ? event.target.closest(".image-embed") : null;
    // Reading view has no image menu of its own; offer the alignment menu there.
    if (!target || !target.closest(".markdown-reading-view")) return;
    const view = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .find(view => view.file && view.containerEl.contains(target));
    const found = view && readingLink(view, target);
    if (!found) return;
    event.preventDefault();
    const menu = new Menu();
    addAlignItems(menu, view, found);
    menu.showAtMouseEvent(event);
  }, true);

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file, source) => {
    if (source !== "link-context-menu" || !IMAGE_EXTS.has(String(file?.extension).toLowerCase()) || !target?.isConnected) return;
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const found = view?.file && view.getMode() !== "preview" ? editorLink(view.editor?.cm, target) : null;
    if (!found) return;
    menu.addSeparator();
    addAlignItems(menu, view, found);
  }));
}

function addAlignItems(menu, view, found) {
  const current = imageAlignment(found.link);
  for (const [align, title, icon] of LABELS) {
    menu.addItem(item => item.setTitle(title).setIcon(icon).setChecked(current === align).setSection("ibp-image-align").onClick(() => {
      keepViewport(view, () => found.apply(withImageAlignment(found.link, align)));
    }));
  }
}

function linksOnLine(text, offset) {
  const links = [];
  for (let index = text.indexOf("!["); index !== -1; index = text.indexOf("![", index + 1)) {
    const link = imageLinkAt(text, index);
    if (link) links.push({ ...link, from: offset + link.from, to: offset + link.to });
  }
  return links;
}

function editorLink(cm, embed) {
  if (!cm || !cm.dom.contains(embed)) return null;
  let pos;
  try { pos = cm.posAtDOM(embed); } catch (_) { return null; }
  const line = cm.state.doc.lineAt(pos);
  const links = linksOnLine(line.text, line.from);
  const link = links.find(link => pos >= link.from && pos <= link.to)
    || links.reduce((best, link) => !best || Math.abs(link.from - pos) < Math.abs(best.from - pos) ? link : best, null);
  if (!link) return null;
  return { link, apply: insert => cm.dispatch({ changes: { from: link.from, to: link.to, insert }, userEvent: "input.ibp-image" }) };
}

// Reading view: the rendered section knows its source lines; pick the image
// link there by its position among the section's image embeds.
function readingLink(view, embed) {
  // Rendered sections carry only their line counts, in source order.
  const sections = view.previewMode?.renderer?.sections || [];
  let lineStart = 0;
  const section = sections.find(section => {
    if (section.el?.contains(embed)) return true;
    lineStart += section.lines || 0;
    return false;
  });
  if (!section) return null;
  const lines = view.data.split("\n");
  const start = lines.slice(0, lineStart).reduce((sum, text) => sum + text.length + 1, 0);
  const text = lines.slice(lineStart, lineStart + Math.max(1, section.lines || 1)).join("\n");
  const links = linksOnLine(text, start);
  const embeds = [...section.el.querySelectorAll(".image-embed")];
  const link = links[embeds.indexOf(embed)] || (links.length === 1 ? links[0] : null);
  if (!link) return null;
  const original = view.data.slice(link.from, link.to);
  return {
    link,
    apply: insert => view.app.vault.process(view.file, data =>
      data.slice(link.from, link.to) === original ? data.slice(0, link.from) + insert + data.slice(link.to) : data)
  };
}

/* Hover toolbar at the image's top-right corner: Obsidian's own edit
   action (proxied, so it keeps its behavior) plus copy, remove (confirmed),
   reset size and left / center / right. Styling lives in the theme. */
const TOOLBAR = "ib-image-actions";

function viewFor(plugin, el) {
  return plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
    .find(view => view.file && view.containerEl.contains(el)) || null;
}

function linkFor(view, embed) {
  if (!view) return null;
  if (embed.closest(".markdown-reading-view")) return readingLink(view, embed);
  return editorLink(view.editor?.cm, embed);
}

async function copyImage(plugin, embed) {
  const img = embed.querySelector("img");
  if (!img) return;
  try {
    const { clipboard, nativeImage } = require("electron");
    const src = img.currentSrc || img.src;
    let buffer;
    // Only vault embeds carry a link path; web images have none.
    const linkPath = embed.getAttribute("src");
    const local = linkPath ? plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(linkPath), viewFor(plugin, embed)?.file?.path || "") : null;
    if (local instanceof TFile && local.extension !== "md") buffer = await plugin.app.vault.readBinary(local);
    else buffer = await downloadImage(src);
    // nativeImage reads only PNG / JPEG; decode anything else (WebP, AVIF, GIF, SVG…)
    // from the bytes themselves and re-encode it as PNG.
    let image = nativeImage.createFromBuffer(Buffer.from(buffer));
    if (image.isEmpty()) image = nativeImage.createFromBuffer(Buffer.from(await toPng(buffer)));
    if (image.isEmpty()) throw new Error("unsupported image");
    clipboard.writeImage(image);
    new Notice("已复制图片");
  } catch (error) {
    console.error("Ignorance Advanced: copy image failed —", error);
    new Notice("复制图片失败");
  }
}

// fetch follows redirects (picsum and most CDNs redirect); requestUrl covers hosts without CORS.
async function downloadImage(url) {
  try {
    const response = await fetch(url);
    if (response.ok) return await response.arrayBuffer();
  } catch (_) {}
  const response = await requestUrl({ url, throw: false });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer;
}

async function toPng(buffer) {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("unsupported image");
  return blob.arrayBuffer();
}

// Crop the vault image behind an embed. "New image" saves a copy and points this embed at it;
// "replace" overwrites the file, and the embeds refresh on their own.
function startCrop(plugin, embed) {
  const view = viewFor(plugin, embed);
  const linkPath = embed.getAttribute("src");
  const file = linkPath ? plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(linkPath), view?.file?.path || "") : null;
  if (!(file instanceof TFile) || !IMAGE_EXTS.has(file.extension.toLowerCase())) { new Notice("只能裁切库内的图片"); return; }
  if (!canCrop(file)) { new Notice("暂不支持裁切这种格式（支持 PNG、JPG、WebP）"); return; }
  void cropImage(plugin, file, ({ mode, file: result }) => {
    if (mode !== "new") return;
    const found = embed.isConnected ? linkFor(view, embed) : null;
    if (!found || !view?.file) { new Notice("已新增图片，但无法定位原链接，请手动引用"); return; }
    const target = plugin.app.metadataCache.fileToLinktext(result, view.file.path, false);
    keepViewport(view, () => found.apply(withImageTarget(found.link, target)));
  });
}

function addButton(bar, icon, label, run, extraClass = "") {
  const button = bar.createDiv({ cls: `ib-image-action ${extraClass}`.trim() });
  setIcon(button, icon);
  setTooltip(button, label, { placement: "top" });
  button.setAttribute("aria-label", label);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    run();
  });
  return button;
}

function decorate(plugin, embed) {
  const wrapper = embed.querySelector(":scope > .image-wrapper") || embed;
  if (wrapper.querySelector(`:scope > .${TOOLBAR}`)) return;
  if (embed.closest(".ibp-book, .ibp-staging, .ibp-export, .reveal")) return;
  installResizeHandles(plugin, embed, wrapper);
  const bar = wrapper.createDiv({ cls: TOOLBAR });
  // Keep the editor from selecting the widget (which would reveal the source).
  bar.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
  const native = label => embed.querySelector(`.embed-actions .embed-action${label}`);
  // Zoom stays on double-click; only the edit action is carried over.
  const edit = native(".edit-block-button");
  if (edit) addButton(bar, "lucide-code-xml", edit.getAttribute("aria-label") || "编辑源码", () => edit.click());
  addButton(bar, "lucide-copy", "复制图片", () => copyImage(plugin, embed));
  addButton(bar, "lucide-crop", "裁切图片", () => startCrop(plugin, embed));
  const change = (make, label) => () => {
    const view = viewFor(plugin, embed);
    const found = linkFor(view, embed);
    if (!found) { new Notice(`无法定位图片链接，未${label}`); return; }
    keepViewport(view, () => found.apply(make(found.link)));
  };
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

function installImageToolbar(plugin) {
  // Handle the pointer before CodeMirror can select/rebuild the image widget.
  plugin.registerDomEvent(document, "pointerdown", event => {
    const handle = event.target instanceof Element ? event.target.closest(".ib-image-resize-handle") : null;
    if (handle?.__ibResizeStart) handle.__ibResizeStart(event);
  }, true);
  const decorateWithin = root => {
    if (!(root instanceof Element)) return;
    if (root.matches(".image-embed")) decorate(plugin, root);
    root.querySelectorAll?.(".image-embed").forEach(embed => decorate(plugin, embed));
  };
  const inMarkdown = node => node instanceof Element && node.closest(".workspace-leaf-content[data-type='markdown']");
  // Only look at what was added, not the whole workspace on every change.
  let pending = [];
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
  const measureColumns = () => document.querySelectorAll(".workspace-leaf-content[data-type='markdown'] .cm-editor").forEach(editor => {
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
  const changes = [];
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
function confirmRemoval(plugin, remove) {
  const modal = new Modal(plugin.app);
  modal.titleEl.setText("删除图片");
  modal.contentEl.createEl("p", { text: "从笔记中移除这张图片？图片文件本身会保留。" });
  const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
  buttons.createEl("button", { text: "删除", cls: "mod-warning" }).addEventListener("click", () => { modal.close(); remove(); });
  buttons.createEl("button", { text: "取消" }).addEventListener("click", () => modal.close());
  modal.open();
}

function installResizeHandles(plugin, embed, wrapper) {
  const img = wrapper.querySelector("img");
  if (!img || wrapper.querySelector(".ib-image-resize-layer")) return;
  const layer = wrapper.createDiv({ cls: "ib-image-resize-layer" });
  const update = () => {
    const width = Number(img.getAttribute("width")), height = Number(img.getAttribute("height"));
    if (width > 0 && height > 0) { img.style.aspectRatio = `${width} / ${height}`; img.style.objectFit = "fill"; img.dataset.ibExplicitRatio = "1"; }
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
  let cancelDrag = null;
  for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const handle = layer.createEl("button", { cls: `ib-image-resize-handle is-${direction}`, attr: { type: "button", "aria-label": direction.length === 2 ? "等比例缩放图片" : "单方向缩放图片" } });
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
      const move = e => {
        if (e.pointerId !== event.pointerId) return;
        e.preventDefault(); e.stopPropagation();
        moved = true;
        next = resizedImageBox(rect.width, rect.height, e.clientX - event.clientX, e.clientY - event.clientY, direction);
        img.style.setProperty("width", `${next.width}px`, "important");
        img.style.setProperty("height", `${next.height}px`, "important");
        img.style.setProperty("object-fit", "fill");
        update();
      };
      const finish = async e => {
        if (e && e.pointerId !== event.pointerId) return;
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", finish, true);
        document.removeEventListener("pointercancel", finish, true);
        layer.classList.remove("is-dragging"); cancelDrag = null;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        let saved = false;
        try { if (moved && e?.type === "pointerup") {
          await keepViewport(view, () => found.apply(withImageSize(found.link, next.width, next.height)));
          saved = true;
        } }
        catch (error) { new Notice(`图片尺寸保存失败：${error.message}`); }
        finally {
          if (saved) { img.style.removeProperty("width"); img.style.removeProperty("height"); update(); }
          else restore();
        }
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
