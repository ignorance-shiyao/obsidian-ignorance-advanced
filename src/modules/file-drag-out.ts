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

let icon: unknown = null;
// A small document badge with the extension, drawn once; the drag image the other app's cursor carries.
function dragIcon(extension: string) {
  const canvas = createEl("canvas");
  canvas.width = 64; canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#8a94a6"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(4, 4, 56, 72, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#3b5bdb"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(extension.slice(0, 5).toUpperCase(), 32, 46);
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
    const extension = path.split(".").pop() ?? "";
    icon ??= dragIcon(extension);
    if (!icon) return;
    event.preventDefault();
    remote.getCurrentWebContents().startDrag({ file: full, icon });
  }, true);
}
