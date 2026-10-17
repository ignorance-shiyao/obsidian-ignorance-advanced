import type { IgnorancePlugin } from "../plugin-types.js";
import { PluginSettingTab, Setting, Platform } from "obsidian";
import * as Appearance from "./appearance.js";
import { LINE_HEIGHT_PRESETS } from "./line-height.js";
import { openSyntaxGuide } from "./syntax-guide.js";
const { applyAppearancePreferences } = Appearance;

export { installTabOpening } from "./tab-opening.js";

const PASTE_IMAGE_DESC = "关闭后交给 Obsidian 按「文件与链接」设置处理。开启时保存到笔记同级的 assets/，按笔记名加序号命名，GIF 保持原格式。";
const CLIPBOARD_DESC = "在其他 App 里复制文章链接后切回 Obsidian，提示一键剪藏到下面设置的文件夹。iPhone 上建议先在「设置 → Obsidian → 从其他 App 粘贴」选「允许」，否则每次都会弹出粘贴确认。";

/* Every setting is described once. Obsidian 1.13+ reads `getSettingDefinitions()` (which makes the rows
   searchable); older versions still call `display()`, which walks the same description. */
class IgnoranceSettingTab extends PluginSettingTab {
  constructor(app, plugin: IgnorancePlugin) { super(app, plugin); this.plugin = plugin; }

  settingGroups() {
    const plugin = this.plugin;
    const state = plugin.state;
    const refreshAppearance = () => { applyAppearancePreferences(plugin); plugin.app.workspace.trigger("css-change"); plugin.saveStoredState(); };
    const toggle = (get, set) => setting => setting.addToggle(control => control.setValue(get()).onChange(value => set(value)));
    const appearanceToggle = (get, key: string) => toggle(get, value => { state.appearance[key] = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); });

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
        { name: "漏打空行时仍识别表格", desc: "表格紧贴在段落下面（中间没空行）时，阅读视图、分页和导出仍按表格显示；编辑时停笔后会自动补上空行。已有笔记可用命令「补全缺失的空行」一次补齐。", aliases: ["lenient blocks", "missing blank line"], add: toggle(() => state.lenientBlocks !== false, value => {
          state.lenientBlocks = value; plugin.saveStoredState();
          for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
        }) },
        { name: "标题自动编号", desc: "阅读视图的标题前显示 1、1.1、1.1.1 这样的编号；也可以只在某篇笔记的 cssclasses 里写 ib-numbered（写 ib-unnumbered 则关闭）。", aliases: ["heading numbers"], add: toggle(() => state.headingNumbers === true, value => {
          state.headingNumbers = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
          for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
        }) },
        { name: "表格十字高亮", desc: "阅读视图里鼠标指到单元格时，高亮它所在的行和列。也可以只在某篇笔记的 cssclasses 里写 ib-crosshair。", aliases: ["table crosshair"], add: toggle(() => state.tableCrosshair === true, value => { state.tableCrosshair = value; plugin.saveStoredState(); }) },
        { name: "长代码块自动折叠", desc: "阅读视图里超过 40 行的代码块默认只显示前 20 行，点「展开全部」查看完整内容。", aliases: ["fold long code"], add: toggle(() => state.autoFoldCode === true, value => {
          state.autoFoldCode = value; plugin.saveStoredState();
          for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
        }) },
        { name: "标题编号风格", desc: "「1.1」是 1、1.1、1.1.1；「一、」是 一、（一）、1.、（1）。", aliases: ["heading number style"], add: setting => setting.addDropdown(dropdown => dropdown
          .addOptions({ decimal: "1.1", chinese: "一、（一）" }).setValue(state.headingNumberStyle || "decimal").onChange(value => {
            state.headingNumberStyle = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
          })) },
        { name: "标题编号起始级别", desc: "「自动」：只有一个 H1 时把它当作笔记标题，从 H2 开始编号；「从 H1」：所有标题都编号；「从 H2」：H1 一律不编号。", aliases: ["heading number start"], add: setting => setting.addDropdown(dropdown => dropdown
          .addOptions({ auto: "自动", h1: "从 H1", h2: "从 H2" }).setValue(state.headingNumberStart || "auto").onChange(value => {
            state.headingNumberStart = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
          })) },
        { name: "标题编号层级", desc: "最多编到第几层，更深的标题不编号。", aliases: ["heading number depth"], add: setting => setting.addDropdown(dropdown => dropdown
          .addOptions({ 1: "1 层", 2: "2 层", 3: "3 层", 4: "4 层", 5: "5 层", 6: "6 层" }).setValue(String(state.headingNumberDepth || 4)).onChange(value => {
            state.headingNumberDepth = Number(value); plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
          })) },
        { name: "图表题注与编号", desc: "阅读视图里给图片和表格加「图 1」「表 1」题注并支持 ((ref:标识)) 交叉引用；图片的 alt 作为图注，表格下一行写「表：说明」。也可以只在某篇笔记的 cssclasses 里写 ib-captions。", aliases: ["captions", "figure numbers"], add: toggle(() => state.captions === true, value => {
          state.captions = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
          for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender?.(true);
        }) },
        { name: "代码块行号", desc: "阅读视图、分页和导出中显示行号；围栏里写 {2,5} 可高亮指定行。", aliases: ["line numbers"], add: toggle(() => Boolean(state.codeLineNumbers), value => {
          state.codeLineNumbers = value; plugin.applyCodeLineNumbers(); plugin.saveStoredState();
        }) }
      ] },
      { heading: "编辑", items: [
        { name: "智能标点", desc: "输入 -- 转为 —、... 转为 …；代码块与行内代码不转换。", add: toggle(() => Boolean(state.smartPunctuation), value => { state.smartPunctuation = value; plugin.saveStoredState(); }) },
        { name: "粘贴图片存入 assets/", desc: PASTE_IMAGE_DESC, add: toggle(() => state.fileTools.convertPastedImages !== false, value => { state.fileTools.convertPastedImages = value; plugin.saveStoredState(); }) }
      ] },
      { heading: "外观", items: [
        { name: "灰度日期", desc: "这些日期整个界面变为灰度，每行一个，写成 月-日，例如 4-4。默认不启用。", aliases: ["gray mode", "grayscale"], add: setting => setting.addTextArea((text: string) => {
          text.setPlaceholder("4-4\n9-18").setValue(state.grayDates || "").onChange(value => { state.grayDates = value; plugin.saveStoredState(); plugin.applyGrayMode?.(); });
          text.inputEl.rows = 3;
        }) }
      ] },
      { heading: "状态栏", items: [
        { name: "显示阅读时长", desc: "在状态栏显示当前笔记的预计阅读时间（仅桌面端）。", aliases: ["reading time"], add: toggle(() => state.readingTime?.enabled !== false, value => {
          state.readingTime.enabled = value; plugin.saveStoredState(); plugin.refreshReadingTime?.();
        }) }
      ] },
      { heading: "剪藏", items: [
        { name: "回到 Obsidian 时检测剪贴板里的链接", desc: CLIPBOARD_DESC, add: toggle(() => Boolean(state.webClip?.watchClipboard), value => { state.webClip.watchClipboard = value; plugin.saveStoredState(); }) },
        { name: "剪藏文件夹", desc: "网页剪藏的笔记和图片保存到这里，文件夹名同时作为笔记标签。默认 Clippings。", aliases: ["clippings"], add: setting => setting.addText((text: string) => text.setPlaceholder("Clippings")
          .setValue(state.webClip?.folder || "").onChange((value: string) => { state.webClip.folder = value.trim(); plugin.saveStoredState(); })) },
        { name: "按网站分类", desc: "剪藏时在剪藏文件夹下按网站名建子文件夹，例如 Clippings/example.com/。", aliases: ["sort by site"], add: toggle(() => Boolean(state.webClip?.byDomain), value => { state.webClip.byDomain = value; plugin.saveStoredState(); }) }
      ] },
      { heading: "标签页", items: [
        { name: "在新标签页打开文件", desc: "从文件列表或内部链接打开文件时新建标签页。", add: toggle(() => Boolean(state.tabs.openInNewTab), value => {
          state.tabs.openInNewTab = value; plugin.saveStoredState(); this.update ? this.update() : this.display();
        }) },
        { name: "已打开时切换过去", desc: "文件已在某个标签页中打开时，切换到那个标签页，不再新建。", visible: () => Boolean(state.tabs.openInNewTab),
          add: toggle(() => Boolean(state.tabs.deduplicateTabs), value => { state.tabs.deduplicateTabs = value; plugin.saveStoredState(); }) }
      ] }
    ];
    groups.push({ heading: "帮助", items: [
      { name: "语法速查", desc: "在库根目录生成一页写法速查笔记并打开；已存在则直接打开。", aliases: ["syntax", "cheat sheet", "帮助"], add: setting => setting.addButton(button =>
        button.setButtonText("打开").onClick(() => void openSyntaxGuide(plugin))) }
    ] });
    if (Platform.isMacOS) {
      groups.push({ heading: "文件", items: [
        { name: "「用…打开」的程序", desc: "每行一个应用名称或 .app 路径，会出现在文件右键菜单中。", add: setting => setting.addTextArea((text: string) => {
          text.setPlaceholder("Visual Studio Code\nPreview\n/Applications/Typora.app")
            .setValue((state.fileTools.apps || []).join("\n"))
            .onChange((value: string) => {
              state.fileTools.apps = [...new Set(value.split("\n").map((item: string) => item.trim()).filter(Boolean))];
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
