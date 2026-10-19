import { Modal } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { FORMAT_LABELS, FORMAT_ORDER, LEVEL_LABELS, SUPPORT_ROWS } from "./export-support-core.js";

class ExportSupportModal extends Modal {
  onOpen() {
    this.setTitle(tr("导出支持表"));
    this.modalEl.addClass("ibp-support-modal");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: tr("每种内容在各个导出格式里会怎样。导出前的「导出检查」会针对当前这篇笔记列出具体位置。") });
    const table = this.contentEl.createEl("table", { cls: "ibp-support-table" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: tr("内容") });
    for (const format of FORMAT_ORDER) head.createEl("th", { text: tr(FORMAT_LABELS[format]) });
    const body = table.createEl("tbody");
    for (const row of SUPPORT_ROWS) {
      const line = body.createEl("tr");
      line.createEl("th", { text: tr(row.block), attr: { scope: "row" } });
      for (const format of FORMAT_ORDER) {
        const cell = row.cells[format];
        const td = line.createEl("td", { cls: `ibp-support-cell is-${cell.level}` });
        td.createSpan({ cls: "ibp-support-level", text: tr(LEVEL_LABELS[cell.level]) });
        if (cell.note) td.createDiv({ cls: "ibp-support-note", text: tr(cell.note) });
      }
    }
  }
  onClose() { this.contentEl.empty(); }
}

export function installExportSupport(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "export-support-table", name: tr("查看导出支持表"), icon: "lucide-table-properties", callback: () => new ExportSupportModal(plugin.app).open() });
}
