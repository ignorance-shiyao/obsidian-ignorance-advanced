import * as Appearance from "./appearance.js";
import { LINE_HEIGHT_PRESETS } from "./line-height.js";
const { applyAppearancePreferences } = Appearance;
const { PluginSettingTab, Setting, Platform } = require("obsidian");

export { installTabOpening } from "./tab-opening.js";

const PASTE_IMAGE_DESC = "关闭后交给 Obsidian 按「文件与链接」设置处理。开启时保存到笔记同级的 assets/，按笔记名加序号命名，GIF 保持原格式。";
const CLIPBOARD_DESC = "在其他 App 里复制文章链接后切回 Obsidian，提示一键剪藏到下面设置的文件夹。iPhone 上建议先在「设置 → Obsidian → 从其他 App 粘贴」选「允许」，否则每次都会弹出粘贴确认。";

/* Every setting is described once. Obsidian 1.13+ reads `getSettingDefinitions()` (which makes the rows
   searchable); older versions still call `display()`, which walks the same description. */
class IgnoranceSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  settingGroups() {
    const plugin = this.plugin;
    const state = plugin.state;
    const refreshAppearance = () => { applyAppearancePreferences(plugin); plugin.app.workspace.trigger("css-change"); plugin.saveStoredState(); };
    const toggle = (get, set) => setting => setting.addToggle(control => control.setValue(get()).onChange(value => set(value)));
    const appearanceToggle = (get, key) => toggle(get, value => { state.appearance[key] = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); });

    // 主题预设与主题色只在左下角调色板中设置；明暗模式用左下角按钮或 Obsidian 外观设置。
    const groups = [
      { heading: "排版", items: [
        { name: "行距", desc: "同时作用于阅读视图与编辑视图。", aliases: ["line height"], add: setting => setting.addDropdown(dropdown => {
          for (const { value, label } of LINE_HEIGHT_PRESETS) dropdown.addOption(String(value), label);
          dropdown.setValue(String(state.appearance.lineHeight)).onChange(value => { state.appearance.lineHeight = value; refreshAppearance(); });
        }) },
        { name: "卡片圆角", desc: "代码块、图表和容器卡片的圆角，单位像素。", add: setting => setting.addSlider(slider => slider.setLimits(0, 16, 1)
          .setValue(Number(state.appearance.cardRadius) || 0).setDynamicTooltip()
          .onChange(value => { state.appearance.cardRadius = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); })) },
        { name: "隐藏标题级别标记", desc: "阅读视图中不显示标题左侧的 H1–H6。", add: appearanceToggle(() => Boolean(state.appearance.hideHeadingLabels), "hideHeadingLabels") },
        { name: "二级标题徽标", desc: "阅读视图的二级标题前显示 # 徽标，默认关闭。", add: appearanceToggle(() => Boolean(state.appearance.headingBadge), "headingBadge") },
        { name: "章节装饰", desc: "显示章节卡片彩色竖条；关闭后保留正文与卡片布局。打印和减少动态效果时自动隐藏。", add: appearanceToggle(() => state.appearance.decorations !== false, "decorations") },
        { name: "表格默认对齐", desc: "仅设置未单独指定位置的表格默认对齐；单个表格请在编辑页面的表格工具栏中设置。", add: setting => setting.addDropdown(dropdown =>
          dropdown.addOptions({ left: "居左", center: "居中", right: "居右" }).setValue(state.appearance.tableAlignment || "left").onChange(value => {
            state.appearance.tableAlignment = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
          })) },
        { name: "代码块行号", desc: "阅读视图、分页和导出中显示行号；围栏里写 {2,5} 可高亮指定行。", aliases: ["line numbers"], add: toggle(() => Boolean(state.codeLineNumbers), value => {
          state.codeLineNumbers = value; plugin.applyCodeLineNumbers(); plugin.saveStoredState();
        }) }
      ] },
      { heading: "编辑", items: [
        { name: "智能标点", desc: "输入 -- 转为 —、... 转为 …；代码块与行内代码不转换。", add: toggle(() => Boolean(state.smartPunctuation), value => { state.smartPunctuation = value; plugin.saveStoredState(); }) },
        { name: "粘贴图片存入 assets/", desc: PASTE_IMAGE_DESC, add: toggle(() => state.fileTools.convertPastedImages !== false, value => { state.fileTools.convertPastedImages = value; plugin.saveStoredState(); }) }
      ] },
      { heading: "状态栏", items: [
        { name: "显示阅读时长", desc: "在状态栏显示当前笔记的预计阅读时间（仅桌面端）。", aliases: ["reading time"], add: toggle(() => state.readingTime?.enabled !== false, value => {
          state.readingTime.enabled = value; plugin.saveStoredState(); plugin.refreshReadingTime?.();
        }) }
      ] },
      { heading: "剪藏", items: [
        { name: "回到 Obsidian 时检测剪贴板里的链接", desc: CLIPBOARD_DESC, add: toggle(() => Boolean(state.webClip?.watchClipboard), value => { state.webClip.watchClipboard = value; plugin.saveStoredState(); }) },
        { name: "剪藏文件夹", desc: "网页剪藏的笔记和图片保存到这里，文件夹名同时作为笔记标签。默认 Clippings。", aliases: ["clippings"], add: setting => setting.addText(text => text.setPlaceholder("Clippings")
          .setValue(state.webClip?.folder || "").onChange(value => { state.webClip.folder = value.trim(); plugin.saveStoredState(); })) }
      ] },
      { heading: "标签页", items: [
        { name: "在新标签页打开文件", desc: "从文件列表或内部链接打开文件时新建标签页。", add: toggle(() => Boolean(state.tabs.openInNewTab), value => {
          state.tabs.openInNewTab = value; plugin.saveStoredState(); this.update ? this.update() : this.display();
        }) },
        { name: "已打开时切换过去", desc: "文件已在某个标签页中打开时，切换到那个标签页，不再新建。", visible: () => Boolean(state.tabs.openInNewTab),
          add: toggle(() => Boolean(state.tabs.deduplicateTabs), value => { state.tabs.deduplicateTabs = value; plugin.saveStoredState(); }) }
      ] }
    ];
    if (Platform.isMacOS) {
      groups.push({ heading: "文件", items: [
        { name: "「用…打开」的程序", desc: "每行一个应用名称或 .app 路径，会出现在文件右键菜单中。", add: setting => setting.addTextArea(text => {
          text.setPlaceholder("Visual Studio Code\nPreview\n/Applications/Typora.app")
            .setValue((state.fileTools.apps || []).join("\n"))
            .onChange(value => {
              state.fileTools.apps = [...new Set(value.split("\n").map(item => item.trim()).filter(Boolean))];
              plugin.saveStoredState();
            });
          text.inputEl.rows = 4;
        }) }
      ] });
    }
    return groups;
  }

  /* Obsidian 1.13+ */
  getSettingDefinitions() {
    return this.settingGroups().map(group => ({
      type: "group",
      heading: group.heading,
      items: group.items.map(item => ({
        name: item.name,
        desc: item.desc,
        aliases: item.aliases,
        visible: item.visible,
        render: setting => { setting.setName(item.name).setDesc(item.desc); item.add(setting); }
      }))
    }));
  }

  /* Obsidian before 1.13 */
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ibm-settings");
    for (const group of this.settingGroups()) {
      new Setting(containerEl).setName(group.heading).setHeading();
      for (const item of group.items) {
        if (item.visible && !item.visible()) continue;
        item.add(new Setting(containerEl).setName(item.name).setDesc(item.desc));
      }
    }
  }
}

export { IgnoranceSettingTab };
