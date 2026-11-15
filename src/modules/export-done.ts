import { Notice, setIcon } from "obsidian";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { electron, vaultBasePath } from "./desktop-files.js";
import { exportFileName, exportLocation } from "./export-done-core.js";
/* The "exported" notice: the file name, and two icon buttons to open it or show it in its folder. */

export function showExportDone(plugin: IgnorancePlugin, label: string, result: string) {
  const fragment = createFragment();
  const row = fragment.createDiv({ cls: "ib-export-done" });
  row.createSpan({ cls: "ib-export-done__text", text: tr("已导出{label}：{result}", { label, result: exportFileName(result) }) });
  const shell = electron()?.shell;
  if (shell) {
    const place = exportLocation(result, vaultBasePath(plugin));
    let notice: Notice | undefined;
    const add = (icon: string, name: string, run: () => void) => {
      const button = row.createEl("button", { cls: "ib-export-done__button clickable-icon", attr: { type: "button", "aria-label": name } });
      setIcon(button, icon);
      button.addEventListener("click", () => { run(); notice?.hide(); });
    };
    add("external-link", tr("打开"), () => { void shell.openPath(place.absolute); });
    add("folder-open", tr("在文件夹中显示"), () => shell.showItemInFolder(place.absolute));
    notice = new Notice(fragment, 8000);
    return;
  }
  new Notice(fragment, 6000);
}
