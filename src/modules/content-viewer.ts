import { Platform, setIcon } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { MAX_SCALE, centred, fitScale, neighbour, wheelFactor, zoomAt, type View } from "./content-viewer-core.js";
/* Reading view: a pointer over a picture, diagram, table or code block shows one round button at its corner;
   it opens that content in a full-window viewer with wheel zoom, drag to pan, double-click to toggle 2x,
   arrow keys to the previous / next item, and Esc to close. The viewer shows a copy, so the note stays as it is. */
const TARGETS = "img, .mermaid, .ibm-mermaid-enhanced, .block-language-mermaid, table, pre";
const SKIP = ".ib-img-icon, .ib-img-logo, .ib-cover-block, .ib-cats-tail, .ib-cat, .emoji, .ib-viewer, .ibc-container-editor-widget, .slide-surface";

function eligible(element: Element): element is HTMLElement {
  if (!element.instanceOf(HTMLElement) || element.closest(SKIP)) return false;
  if (element.matches("table, pre") && element.closest("table, pre") !== element) return false;
  const box = element.getBoundingClientRect();
  if (box.width < 96 || box.height < 48) return false;
  // A picture inside a diagram or table belongs to that block.
  return !(element.matches("img") && element.parentElement?.closest("table, pre, .mermaid, .block-language-mermaid"));
}

function outermost(from: Element | null): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (let node = from?.closest(TARGETS) ?? null; node; node = node.parentElement?.closest(TARGETS) ?? null) {
    if (eligible(node)) found = node;
  }
  return found;
}

function copyOf(source: HTMLElement): { node: HTMLElement; width: number; height: number } {
  const box = source.getBoundingClientRect();
  const holder = createDiv({ cls: "ib-viewer__content markdown-rendered" });
  let node: HTMLElement;
  if (source.instanceOf(HTMLImageElement)) {
    node = createEl("img", { attr: { src: source.currentSrc || source.src, alt: source.alt } });
    node.setCssStyles({ width: `${box.width}px`, height: `${box.height}px` });
  } else {
    node = source.cloneNode(true) as HTMLElement;
    node.querySelectorAll(".ib-fold-toggle, .ib-code-tools, .copy-code-button").forEach(extra => extra.remove());
    node.classList.remove("ib-fold", "is-folded", "ib-code-folded");
    node.setCssStyles({ width: `${box.width}px`, maxHeight: "none" });
    const svg = node.matches("svg") ? node : node.querySelector("svg");
    if (svg && !source.matches("table, pre")) svg.setCssStyles({ width: `${box.width}px`, height: `${box.height}px`, maxWidth: "none" });
  }
  holder.appendChild(node);
  return { node: holder, width: box.width, height: source.matches("table, pre") ? 0 : box.height };
}

export function installContentViewer(plugin: IgnorancePlugin) {
  if (Platform.isMobile) return;
  let open: HTMLButtonElement | null = null;
  let hovered: HTMLElement | null = null;
  let viewing = false;
  let timer = 0;

  const hide = () => { window.clearTimeout(timer); open?.remove(); open = null; hovered = null; };
  const showFor = (target: HTMLElement) => {
    if (viewing || hovered === target) return;
    hide();
    hovered = target;
    const box = target.getBoundingClientRect();
    const button = createEl("button", { cls: "ib-viewer-open", attr: { type: "button", "aria-label": tr("全屏查看") } });
    setIcon(button, "maximize-2");
    button.setCssStyles({ top: `${Math.max(8, box.top + 8)}px`, left: `${Math.min(window.innerWidth - 40, box.right - 36)}px` });
    button.addEventListener("pointerenter", () => window.clearTimeout(timer));
    button.addEventListener("pointerleave", () => { timer = window.setTimeout(hide, 250); });
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); const item = target; hide(); openViewer(item); });
    document.body.appendChild(button);
    open = button;
  };

  const openViewer = (start: HTMLElement) => {
    const scope = start.closest<HTMLElement>(".markdown-reading-view") ?? document.body;
    const items = [...scope.querySelectorAll<HTMLElement>(TARGETS)].filter(item => eligible(item) && outermost(item) === item);
    if (!items.includes(start)) items.push(start);
    let at = items.indexOf(start);
    viewing = true;
    const overlay = createDiv({ cls: "ib-viewer", attr: { role: "dialog", "aria-modal": "true", tabindex: "-1" } });
    const stage = overlay.createDiv({ cls: "ib-viewer__stage" });
    const bar = overlay.createDiv({ cls: "ib-viewer__bar" });
    const button = (icon: string, label: string, action: () => void) => {
      const element = bar.createEl("button", { cls: "ib-viewer__button", attr: { type: "button", "aria-label": label } });
      setIcon(element, icon);
      element.addEventListener("click", action);
      return element;
    };
    let view: View = { scale: 1, x: 0, y: 0 };
    let content: { node: HTMLElement; width: number; height: number } | null = null;
    let size = { width: 0, height: 0 };
    let fitted = 1;
    const paint = () => content?.node.setCssStyles({ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` });
    const fit = () => {
      if (!content) return;
      const area = stage.getBoundingClientRect();
      size = { width: content.width, height: content.height || content.node.offsetHeight };
      fitted = fitScale(size.width, size.height, area.width - 48, area.height - 96);
      view = centred(size.width, size.height, area.width, area.height, fitted);
      // Tall tables and code start at the top rather than the middle.
      if (!content.height) view.y = Math.max(72, view.y);
      paint();
    };
    const load = () => {
      content?.node.remove();
      content = copyOf(items[at]);
      stage.appendChild(content.node);
      fit();
      previous.disabled = at <= 0;
      next.disabled = at >= items.length - 1;
    };
    const previous = button("chevron-left", tr("上一项"), () => { at = neighbour(at, items.length, -1); load(); });
    const next = button("chevron-right", tr("下一项"), () => { at = neighbour(at, items.length, 1); load(); });
    button("scan", tr("适应窗口"), fit);
    button("locate-fixed", tr("回到文档位置"), () => { close(); items[at].scrollIntoView({ block: "center" }); });
    button("x", tr("关闭"), () => close());

    const pointers = new Map<number, { x: number; y: number }>();
    const local = (event: { clientX: number; clientY: number }) => {
      const area = stage.getBoundingClientRect();
      return { x: event.clientX - area.left, y: event.clientY - area.top };
    };
    stage.addEventListener("wheel", event => {
      event.preventDefault();
      const point = local(event);
      view = zoomAt(view, wheelFactor(event.deltaY), point.x, point.y);
      paint();
    }, { passive: false });
    stage.addEventListener("dblclick", event => {
      const point = local(event);
      view = view.scale > fitted * 1.05 ? centred(size.width, size.height, stage.clientWidth, stage.clientHeight, fitted) : zoomAt(view, Math.min(2 / view.scale, MAX_SCALE / view.scale), point.x, point.y);
      paint();
    });
    stage.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("is-dragging");
    });
    stage.addEventListener("pointermove", event => {
      const old = pointers.get(event.pointerId);
      if (!old) return;
      view = { ...view, x: view.x + event.clientX - old.x, y: view.y + event.clientY - old.y };
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      paint();
    });
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) stage.classList.remove("is-dragging");
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "ArrowLeft" && !previous.disabled) { event.preventDefault(); previous.click(); }
      if (event.key === "ArrowRight" && !next.disabled) { event.preventDefault(); next.click(); }
      if (event.key === "0") { event.preventDefault(); fit(); }
    };
    const onResize = () => { if (view.scale === fitted) fit(); };
    const active = document.activeElement;
    const previousFocus = active?.instanceOf(HTMLElement) ? active : null;
    function close() {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      overlay.remove();
      viewing = false;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    overlay.addEventListener("click", event => { if (event.target === overlay || event.target === stage) { if (!pointers.size) close(); } });
    document.body.appendChild(overlay);
    overlay.focus();
    load();
  };

  plugin.registerDomEvent(document, "pointerover", event => {
    if (viewing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".ib-viewer-open")) return;
    const inReading = target?.closest(".markdown-reading-view .markdown-preview-view");
    const found = inReading ? outermost(target) : null;
    if (found) { window.clearTimeout(timer); showFor(found); }
    else if (open && hovered && !hovered.contains(target)) { window.clearTimeout(timer); timer = window.setTimeout(hide, 250); }
  });
  plugin.registerDomEvent(document, "scroll", hide, true);
  plugin.register(hide);
}
