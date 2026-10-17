import { Platform } from "obsidian";

// Desktop layout for exports (print dialog for PDF). Mobile — including
// Obsidian's mobile emulation on desktop — uses the image-based fallbacks.
export function hasDesktopExports() {
  return Boolean(Platform.isDesktopApp && !Platform.isMobile);
}
