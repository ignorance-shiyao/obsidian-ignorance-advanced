import { Modal, type App } from "obsidian";
import { tr } from "../i18n.js";

/** Asks for a line (or a block) of text; resolves with null when the dialog is cancelled. */
export function askText(app: App, options: { heading: string; hint?: string; initial?: string; multiline?: boolean; confirm?: string }): Promise<string | null> {
  return new Promise(resolve => {
    let answered = false;
    const finish = (value: string | null, modal: Modal) => { if (answered) return; answered = true; resolve(value); modal.close(); };
    class PromptModal extends Modal {
      onOpen() {
        this.setTitle(options.heading);
        if (options.hint) this.contentEl.createDiv({ cls: "ib-form-hint", text: options.hint });
        const input = options.multiline
          ? this.contentEl.createEl("textarea", { cls: "ibp-layout-text", attr: { rows: "8", spellcheck: "false" } })
          : this.contentEl.createEl("input", { cls: "ib-footer-input", attr: { type: "text" } });
        input.value = options.initial ?? "";
        const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
        footer.createEl("button", { text: tr("取消") }).addEventListener("click", () => finish(null, this));
        const done = () => finish(input.value, this);
        footer.createEl("button", { cls: "mod-cta", text: options.confirm ?? tr("确定") }).addEventListener("click", done);
        if (!options.multiline) input.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Enter") done(); });
        window.setTimeout(() => input.focus(), 50);
      }
      onClose() { this.contentEl.empty(); if (!answered) { answered = true; resolve(null); } }
    }
    new PromptModal(app).open();
  });
}
