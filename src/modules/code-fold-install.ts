import type { IgnorancePlugin } from "../plugin-types.js";
import { applyFolds, markTallTables } from "./code-fold.js";
export function installCodeFold(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (!context.getSectionInfo?.(element)) return;
    markTallTables(element);
    if (plugin.state?.autoFoldCode !== true) return;
    if (element.closest(".ibc-container-editor-widget")) return;
    applyFolds(element);
  });
}
