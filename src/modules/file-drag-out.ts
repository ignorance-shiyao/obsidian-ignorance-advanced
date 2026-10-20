import { Platform } from "obsidian";
import type { FileSystemAdapter } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { electron } from "./desktop-files.js";
/* Dragging a file out of the file list into another app (a chat window, a mail draft, Finder) hands over the
   file itself instead of an obsidian:// address. Inside Obsidian a drag still moves files and makes links, so the
   real file is only handed over when Alt is held, or for files in the export folder, whose purpose is to be sent
   somewhere (the setting "Drag files out" can make it always or never). */

export type DragOutMode = "alt" | "always" | "off";
export const normalizeDragOut = (value: unknown): DragOutMode => value === "always" || value === "off" ? value : "alt";

const TYPE_COLORS: Record<string, string> = {
  docx: "#2b6cb0", doc: "#2b6cb0", pdf: "#d9381e", pptx: "#d9622b", ppt: "#d9622b", xlsx: "#217346", xls: "#217346", csv: "#217346",
  html: "#7048e8", epub: "#0b7285", png: "#0c8599", jpg: "#0c8599", jpeg: "#0c8599", gif: "#0c8599", svg: "#0c8599", webp: "#0c8599",
  json: "#a8761b", md: "#5c6370", txt: "#5c6370", zip: "#8a6d3b"
};

// A document badge in the colour of its type, with the extension on it and the file name under it: the image the
// other app's cursor carries. Drawn per drag, because the name differs.
function dragIcon(extension: string, fileName: string) {
  const width = 150, height = 108;
  const canvas = createEl("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const color = TYPE_COLORS[extension.toLowerCase()] ?? "#6b7280";
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#c3c9d4"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(width / 2 - 26, 4, 52, 66, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(width / 2 - 26, 38, 52, 22, 5); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(extension.slice(0, 5).toUpperCase(), width / 2, 54);
  ctx.fillStyle = "#1f2937"; ctx.font = "13px sans-serif";
  // Too long: shorten the middle so the extension stays visible.
  const dot = fileName.lastIndexOf(".");
  const tail = dot > 0 ? fileName.slice(dot) : "";
  let stem = dot > 0 ? fileName.slice(0, dot) : fileName, label = fileName;
  while (stem.length > 1 && ctx.measureText(label).width > width - 8) { stem = stem.slice(0, -1); label = `${stem}…${tail}`; }
  ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(width / 2 - ctx.measureText(label).width / 2 - 4, 80, ctx.measureText(label).width + 8, 20);
  ctx.fillStyle = "#1f2937";
  ctx.fillText(label, width / 2, 95);
  return electron()?.nativeImage.createFromDataURL(canvas.toDataURL("image/png")) ?? null;
}

export function installFileDragOut(plugin: IgnorancePlugin) {
  if (!Platform.isDesktopApp || Platform.isMobile) return;
  plugin.registerDomEvent(document, "dragstart", (event: DragEvent) => {
    const mode = normalizeDragOut(plugin.state.dragOut);
    const row = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".nav-file-title[data-path]");
    const path = row?.dataset.path;
    if (mode === "off" || !path) return;
    const inExports = path.startsWith("导出/") || path.startsWith(`${(plugin.state.exportDir ?? "").trim()}/`);
    if (mode === "alt" && !event.altKey && !inExports) return;
    const adapter = plugin.app.vault.adapter as FileSystemAdapter;
    const full = adapter.getFullPath?.(path);
    const remote = electron()?.remote;
    if (!full || !remote) return;
    const name = path.split("/").pop() ?? path;
    const icon = dragIcon(name.includes(".") ? name.split(".").pop() ?? "" : "", name);
    if (!icon) return;
    // Obsidian's own handler must not see this drag: it would start its in-app drag (the "move to" ghost) and, with the
    // native drag taking over, never get the dragend that clears it.
    event.preventDefault();
    event.stopImmediatePropagation();
    remote.getCurrentWebContents().startDrag({ file: full, icon });
    clearAppDrag(plugin);
  }, true);
}

/* The native drag never sends the page a dragend, and while it is running the pointer passing back over the window
   still delivers dragenter/dragover, which Obsidian's drag manager answers with a drop highlight and a click-blocking
   overlay that nothing then clears. So while our native drag is in flight those events are swallowed, and when the
   pointer or window comes back (a plain mousemove, mouseup or focus) Obsidian's drag state is cleared. */
const DRAG_EVENTS = ["dragenter", "dragover", "dragleave", "drop"];
const RETURN_EVENTS = ["mousemove", "mouseup", "pointermove", "focus", "keydown"];

function clearAppDrag(plugin: IgnorancePlugin) {
  const manager = (plugin.app as unknown as { dragManager?: { onDragEnd?: () => void; updateHover?: (el: null, cls: string) => void; removeOverlay?: () => void } }).dragManager;
  const clear = () => {
    manager?.onDragEnd?.();
    manager?.updateHover?.(null, "");
    manager?.removeOverlay?.();
    for (const el of Array.from(document.querySelectorAll(".is-being-dragged-over, .drag-ghost"))) {
      el.classList.remove("is-being-dragged-over");
      if (el.classList.contains("drag-ghost")) el.remove();
    }
    document.body.classList.remove("is-grabbing");
  };
  const swallow = (event: Event) => event.stopImmediatePropagation();
  const finish = () => {
    for (const type of DRAG_EVENTS) window.removeEventListener(type, swallow, true);
    for (const type of RETURN_EVENTS) window.removeEventListener(type, finish, true);
    clear();
    window.setTimeout(clear, 50);
  };
  for (const type of DRAG_EVENTS) window.addEventListener(type, swallow, true);
  clear();
  // Leave a moment before the return events count: the pointer that started the drag is still moving.
  window.setTimeout(() => { for (const type of RETURN_EVENTS) window.addEventListener(type, finish, true); }, 400);
  // Never leave the page deaf to drops if nothing ever comes back.
  window.setTimeout(finish, 120000);
}
