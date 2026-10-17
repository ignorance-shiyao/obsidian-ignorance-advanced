// Globals Obsidian puts on the renderer window that the plugin relies on.
export {};

declare global {
  interface Window {
    /** Desktop only: Obsidian's preload bridge to the main process. */
    electron: {
      ipcRenderer: {
        send(channel: string, ...args: unknown[]): void;
        once(channel: string, listener: (...args: unknown[]) => void): void;
      };
    };
    /** The mermaid instance Obsidian (or the plugin's bundled copy) installs. */
    mermaid: {
      render(id: string, text: string, container?: Element): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
      initialize(config: Record<string, unknown>): void;
      [key: string]: unknown;
    };
  }
}

declare module "obsidian" {
  interface Editor {
    /** The CodeMirror 6 view behind a Markdown editor (internal but stable). */
    cm?: import("@codemirror/view").EditorView;
  }
}
