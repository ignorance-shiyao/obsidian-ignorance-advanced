/* Page footer text for the paged reading view and its exports: a template with {title}, {page}, {pages} and
   {date}, shown at the bottom left of every page. */
export const FOOTER_CHOICES: Array<[string, string]> = [
  ["", "不显示"],
  ["{title}", "笔记标题"],
  ["{title} · {date}", "笔记标题 · 日期"],
  ["第 {page} 页，共 {pages} 页", "第 N 页，共 M 页"]
];

export function renderFooter(template: string, values: { title: string; page: number; pages: number; date: string }) {
  return String(template || "")
    .replace(/\{title\}/g, values.title)
    .replace(/\{page\}/g, String(values.page))
    .replace(/\{pages\}/g, String(values.pages))
    .replace(/\{date\}/g, values.date)
    .trim();
}

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Add the footer to every sheet (replacing a previous one). */
export function addPageFooters(sheets: HTMLElement[], template: string, title: string) {
  sheets.forEach((sheet, index) => {
    sheet.querySelector(":scope > .ibp-page-footer")?.remove();
    const text = renderFooter(template, { title, page: index + 1, pages: sheets.length, date: localDate() });
    if (!text) return;
    sheet.appendChild(createDiv({ cls: "ibp-page-footer", text }));
  });
}

export function promptFooter(plugin, current: string, onSubmit: (value: string) => void) {
  const { Modal } = require("obsidian");
  class FooterModal extends Modal {
    onOpen() {
      this.setTitle("页脚文字");
      this.contentEl.createDiv({ cls: "ib-form-hint", text: "可用 {title} 笔记标题、{page} 页码、{pages} 总页数、{date} 日期。" });
      const input = this.contentEl.createEl("input", { attr: { type: "text", spellcheck: "false" } });
      input.style.width = "100%";
      input.value = current;
      const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
      footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
      footer.createEl("button", { cls: "mod-cta", text: "确定" }).addEventListener("click", () => { onSubmit(input.value); this.close(); });
      input.addEventListener("keydown", event => { if (event.key === "Enter") { onSubmit(input.value); this.close(); } });
      window.setTimeout(() => input.focus(), 50);
    }
    onClose() { this.contentEl.empty(); }
  }
  new FooterModal(plugin.app).open();
}
