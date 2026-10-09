/* The note's "⋯" menu keeps only what the title-row toolbar does not offer.
   Items are matched by icon (and section where an icon is shared), not by
   their localized titles. Other plugins add items after this handler runs, so
   filtering happens right before the menu is shown. */

const DUPLICATED_BY_TOOLBAR = [
  { icon: "lucide-book-open", section: "pane" },   // 阅读视图
  { icon: "lucide-pencil", section: "pane" },      // 编辑视图
  { icon: "lucide-edit-3", section: "pane" },      // 编辑视图（旧图标）
  { icon: "lucide-separator-vertical" },           // 左右分屏
  { icon: "lucide-separator-horizontal" },         // 上下分屏
  { icon: "lucide-file-down", section: "action" }, // 导出为 PDF
];
const UNRELATED_TO_NOTE = ["lucide-file-json", "excalidraw-icon"]; // Create Code File, 新建绘图文件

function iconOf(item) {
  const svg = item.iconEl?.querySelector("svg") || item.dom?.querySelector(".menu-item-icon svg");
  return [...(svg?.classList || [])].find(name => name !== "svg-icon") || "";
}

export function shouldHideMoreMenuItem(icon, section) {
  if (UNRELATED_TO_NOTE.includes(icon)) return true;
  return DUPLICATED_BY_TOOLBAR.some(rule => rule.icon === icon && (!rule.section || rule.section === section));
}

export function installMoreMenuFilter(plugin) {
  // Phones get no title-row toolbar, so only Obsidian's PDF is duplicated there
  // (by the plugin's paged PDF in the same menu).
  const { Platform } = require("obsidian");
  const phone = Platform.isPhone;
  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file, source) => {
    if (source !== "more-options" || file?.extension !== "md") return;
    const show = menu.showAtPosition;
    if (typeof show !== "function" || !Array.isArray(menu.items)) return;
    menu.showAtPosition = function (...args) {
      menu.items = menu.items.filter(item => {
        const icon = iconOf(item);
        const hide = phone ? icon === "lucide-file-down" && item.section === "action" : shouldHideMoreMenuItem(icon, item.section);
        if (!item?.dom || !hide) return true;
        item.dom.remove();
        return false;
      });
      return show.apply(this, args);
    };
  }));
}
