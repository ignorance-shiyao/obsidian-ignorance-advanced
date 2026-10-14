import type { IgnorancePlugin } from "../plugin-types.js";
/* Long code blocks in Reading view start folded to their first lines, with a button to show everything.
   Off by default (setting "fold long code blocks"). Paged reading and exports always show the whole block. */
export const FOLD_ABOVE = 40;

export function codeLineCount(text: string): number {
  return String(text || "").replace(/\n$/, "").split("\n").length;
}

export function installCodeFold(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (plugin.state?.autoFoldCode !== true || !context.getSectionInfo?.(element)) return;
    for (const pre of element.querySelectorAll("pre")) {
      if (pre.classList.contains("ib-code-folded") || pre.closest(".ibc-container-editor-widget")) continue;
      const lines = codeLineCount(pre.textContent || "");
      if (lines <= FOLD_ABOVE) continue;
      pre.classList.add("ib-code-folded");
      const button = createEl("button", { cls: "ib-code-expand", text: `展开全部 ${lines} 行`, attr: { type: "button" } });
      button.addEventListener("click", () => {
        const folded = pre.classList.toggle("ib-code-folded");
        button.textContent = folded ? `展开全部 ${lines} 行` : "收起";
      });
      pre.after(button);
    }
  });
}
