import type { MarkdownView } from "obsidian";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Modal } from "obsidian";
import { ENHANCEMENTS, REASON_TEXT, THIRD_PARTY, classNames, enhancementOffReason, noteOffClass, type EnhancementKind } from "./enhancement-gate-core.js";
/* One place that answers "is this enhancement on here?": the settings switch, the note's own `ib-no-…` class,
   and blocks another plugin has already handled. Every enhancement entry point asks before it adds anything. */

const settingOn = (plugin: IgnorancePlugin, kind: EnhancementKind) => plugin.state?.enhance?.[kind] !== false;

/** `element` may still be detached (a post-processor's section), so the note's cssclasses can also come from `frontmatter`. */
export function enhancementOn(plugin: IgnorancePlugin, kind: EnhancementKind, element?: Element | null, frontmatter?: unknown): boolean {
  if (!settingOn(plugin, kind)) return false;
  if (element?.closest(`.${noteOffClass(kind)}`) || classNames(frontmatter).includes(noteOffClass(kind))) return false;
  return true;
}

/** True when `block` is, or sits in, something another plugin already enhanced. */
export function handledByOther(kind: EnhancementKind, block: Element | null | undefined): boolean {
  const selector = THIRD_PARTY[kind];
  return Boolean(selector && block?.closest(selector));
}

class ActiveEnhancementsModal extends Modal {
  constructor(private plugin: IgnorancePlugin, private view: MarkdownView | null) { super(plugin.app); }
  onOpen() {
    this.setTitle(tr("当前笔记生效的增强"));
    const file = this.view?.file;
    const frontmatter = file ? this.plugin.app.metadataCache.getFileCache(file)?.frontmatter : null;
    const noteClasses = classNames(frontmatter);
    if (!file) this.contentEl.createDiv({ cls: "ib-form-hint", text: tr("先打开一篇笔记。") });
    for (const { kind, label } of ENHANCEMENTS) {
      const other = Boolean(this.view && THIRD_PARTY[kind] && this.view.containerEl.querySelector(THIRD_PARTY[kind]));
      const reason = enhancementOffReason({ settingOn: settingOn(this.plugin, kind), noteClasses, kind, handledByOther: false });
      const row = this.contentEl.createDiv({ cls: `ibp-enhancement-row${reason ? " is-off" : ""}` });
      row.createSpan({ cls: "ibp-enhancement-name", text: tr(label) });
      row.createSpan({ cls: "ibp-enhancement-state", text: reason ? tr("关 · {reason}", { reason: tr(REASON_TEXT[reason]) }) : other ? tr("开 · 部分块已有其他插件处理，不叠加") : tr("开") });
    }
    this.contentEl.createDiv({ cls: "ib-form-hint", text: tr("只想对这一篇关闭，在笔记属性 cssclasses 里加 ib-no-tables、ib-no-images、ib-no-code 或 ib-no-charts。") });
  }
  onClose() { this.contentEl.empty(); }
}

export function showActiveEnhancements(plugin: IgnorancePlugin, view: MarkdownView | null) {
  new ActiveEnhancementsModal(plugin, view).open();
}
