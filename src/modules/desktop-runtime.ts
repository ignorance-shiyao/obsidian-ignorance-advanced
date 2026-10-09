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
