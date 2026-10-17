// Obsidian APIs the plugin uses that the published typings leave out. Each one is feature-checked or
// optional at the call site, so a release that drops it degrades the feature instead of throwing.
import "obsidian";

declare module "obsidian" {
  interface App {
    /** Settings window (open / openTabById). */
    setting?: { open(): void; openTabById(id: string): void; close?(): void };
    isMobile?: boolean;
  }
  interface Vault {
    getConfig?(key: string): unknown;
    setConfig?(key: string, value: unknown): void;
    getAvailablePath?(path: string, extension: string): string;
  }
  interface MenuItem {
    setSubmenu?(): Menu;
  }
  interface Menu {
    items?: MenuItem[];
  }
  interface WorkspaceLeaf {
    rebuildView?(): void;
    /** Set by this plugin while it opens a path itself (tab-opening.ts). */
    _ibPathOverride?: string;
    _ibOpenPlain?: boolean;
  }
  interface Component {
    _loaded?: boolean;
  }
}
