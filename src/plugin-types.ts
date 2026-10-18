/** The plugin instance, shared by every module (type-only import, erased at build time). */
export type IgnorancePlugin = import("./main.js").IgnoranceBlueMermaidPlugin;

export type * from "./plugin-state.js";
