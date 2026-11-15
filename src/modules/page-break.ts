import { setIcon } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { isPageBreakText } from "./page-break-core.js";
/* Reading view: a `---page` paragraph shows as a dashed divider with a small page glyph. Paged reading and
   exports break the page there instead (see staged-enhance.ts). */
export function installPageBreak(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (!context.getSectionInfo?.(element)) return;
    for (const paragraph of element.querySelectorAll<HTMLElement>(":scope > p")) {
      if (!isPageBreakText(paragraph.textContent) || paragraph.querySelector("code, a, em, strong")) continue;
      paragraph.empty();
      paragraph.classList.add("ib-page-break-mark");
      paragraph.setAttribute("aria-label", tr("分页"));
      setIcon(paragraph.createSpan({ cls: "ib-page-break-mark__icon" }), "file-minus-2");
    }
  });
}
