import type { IgnorancePlugin } from "../plugin-types.js";
import { enhancementOn } from "./enhancement-gate.js";
import { copyableText } from "./inline-code-copy-core.js";
/* Reading view: clicking inline code copies it, and the code flashes to confirm. Selecting text, links and
   code blocks are left alone. Follows the "code enhancement" switch, in settings and per note. */
const FLASH_MS = 900;
const timers = new WeakMap<HTMLElement, number>();

export function installInlineCodeCopy(plugin: IgnorancePlugin) {
  plugin.registerDomEvent(document, "click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const code = target?.closest<HTMLElement>("code");
    if (!code || code.closest("pre, a, button, .ibc-container-editor-widget, .slide-surface")) return;
    if (!code.closest(".markdown-reading-view .markdown-preview-view") || !enhancementOn(plugin, "code", code)) return;
    const text = copyableText(code.textContent, window.getSelection()?.toString() ?? "");
    if (text === null) return;
    void navigator.clipboard.writeText(text).then(() => {
      window.clearTimeout(timers.get(code));
      code.classList.add("is-copied");
      timers.set(code, window.setTimeout(() => code.classList.remove("is-copied"), FLASH_MS));
    }).catch(() => undefined);
  });
}
