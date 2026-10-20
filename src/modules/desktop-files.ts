import { Platform } from "obsidian";
import type { FileSystemAdapter } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
/* Desktop-only file access outside the vault: writing an export to a folder of the user's choice, and picking
   that folder. Obsidian's vault API cannot reach outside the vault, so this uses Node and Electron directly. */

interface NodeFs { mkdirSync(path: string, options: { recursive: boolean }): void; existsSync(path: string): boolean; writeFileSync(path: string, data: string | Uint8Array): void }
interface NodePath { join(...parts: string[]): string; isAbsolute(path: string): boolean }
interface ElectronRemote {
  dialog: { showOpenDialog(options: { properties: string[]; defaultPath?: string; title?: string }): Promise<{ canceled: boolean; filePaths: string[] }> };
  getCurrentWebContents(): { startDrag(item: { file: string; icon: unknown }): void };
}
interface Electron { remote?: ElectronRemote; nativeImage: { createFromDataURL(url: string): unknown } }

const load = <T>(id: string): T | null => {
  if (!Platform.isDesktopApp) return null;
  try { return (window as unknown as { require?: (id: string) => T }).require?.(id) ?? null; } catch { return null; }
};
export const electron = () => load<Electron>("electron");

/** A folder outside the vault, as an absolute path; "" or a relative path means the vault's own export folder. */
export function externalExportDir(plugin: IgnorancePlugin): string {
  const dir = (plugin.state.exportDir ?? "").trim();
  const path = load<NodePath>("path");
  return dir && path?.isAbsolute(dir) ? dir : "";
}

/** Writes `data` into `dir` under a name that does not exist yet; returns the full path. */
export function writeOutside(dir: string, name: string, data: string | Uint8Array): string {
  const fs = load<NodeFs>("fs"), path = load<NodePath>("path");
  if (!fs || !path) throw new Error("fs unavailable");
  fs.mkdirSync(dir, { recursive: true });
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : "";
  let target = path.join(dir, name);
  for (let index = 2; fs.existsSync(target); index += 1) target = path.join(dir, `${stem} ${index}${extension}`);
  fs.writeFileSync(target, data);
  return target;
}

export async function chooseFolder(start: string): Promise<string | null> {
  const remote = electron()?.remote;
  if (!remote) return null;
  const result = await remote.dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], defaultPath: start || undefined });
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
}

export const vaultBasePath = (plugin: IgnorancePlugin): string => (plugin.app.vault.adapter as FileSystemAdapter).getBasePath?.() ?? "";
