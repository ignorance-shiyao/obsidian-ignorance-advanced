export function electronRemote() {
  // Null on mobile (and in mobile emulation), where Electron is not reachable.
  try { return require("electron")?.remote || null; } catch (_) { return null; }
}

// Electron-backed exports (save dialog, fs, page capture). Mobile — including
// Obsidian's mobile emulation on desktop — uses the vault-based fallbacks.
export function hasDesktopExports() {
  const { Platform } = require("obsidian");
  return Boolean(Platform.isDesktopApp && !Platform.isMobile);
}

/* The vault's folder on disk, only where the vault lives in a real folder (desktop and some mobile setups
   without one return ""). Nothing here reaches outside the vault API when the adapter cannot say. */
export function vaultBasePath(plugin): string {
  const adapter = plugin.app.vault.adapter;
  return typeof adapter?.getBasePath === "function" ? adapter.getBasePath() : "";
}

export function vaultFullPath(plugin, vaultPath: string): string {
  const adapter = plugin.app.vault.adapter;
  return typeof adapter?.getFullPath === "function" ? adapter.getFullPath(vaultPath) : "";
}
