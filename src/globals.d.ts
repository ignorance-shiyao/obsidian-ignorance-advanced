// Globals Obsidian puts on the renderer window that the plugin relies on.
export {};

declare global {
  interface Window {
    /** The mermaid instance Obsidian installs (the plugin's router stands in for it). */
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
