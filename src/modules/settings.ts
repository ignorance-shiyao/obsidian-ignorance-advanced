import * as Appearance from "./appearance.js";
import { LINE_HEIGHT_PRESETS } from "./line-height.js";
const { applyAppearancePreferences, addDropdownSetting } = Appearance;
const { PluginSettingTab, Setting, Platform } = require("obsidian");

export { installTabOpening } from "./tab-opening.js";

class IgnoranceSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    const plugin = this.plugin;
    const state = plugin.state;
    containerEl.empty();
    containerEl.addClass("ibm-settings");

    const refreshAppearance = () => { applyAppearancePreferences(plugin); plugin.app.workspace.trigger("css-change"); plugin.saveStoredState(); };

    // 主题预设与主题色只在左下角调色板中设置；明暗模式用左下角按钮或 Obsidian 外观设置。
    new Setting(containerEl).setName("排版").setHeading();
    addDropdownSetting(containerEl, "行距", "同时作用于阅读视图与编辑视图。", state.appearance.lineHeight,
      LINE_HEIGHT_PRESETS.map(({ value, label }) => [value, label]), value => { state.appearance.lineHeight = value; refreshAppearance(); });
    new Setting(containerEl).setName("卡片圆角").setDesc("代码块、图表和容器卡片的圆角，单位像素。")
      .addSlider(slider => slider.setLimits(0, 16, 1).setValue(Number(state.appearance.cardRadius) || 0).setDynamicTooltip()
        .onChange(value => { state.appearance.cardRadius = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); }));
    new Setting(containerEl).setName("隐藏标题级别标记").setDesc("阅读视图中不显示标题左侧的 H1–H6。")
      .addToggle(toggle => toggle.setValue(Boolean(state.appearance.hideHeadingLabels)).onChange(value => {
        state.appearance.hideHeadingLabels = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
      }));
    new Setting(containerEl).setName("二级标题徽标").setDesc("阅读视图的二级标题前显示 # 徽标，默认关闭。")
      .addToggle(toggle => toggle.setValue(Boolean(state.appearance.headingBadge)).onChange(value => {
        state.appearance.headingBadge = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
      }));
    new Setting(containerEl).setName("章节装饰").setDesc("显示章节卡片彩色竖条；关闭后保留正文与卡片布局。打印和减少动态效果时自动隐藏。")
      .addToggle(toggle => toggle.setValue(state.appearance.decorations !== false).onChange(value => {
        state.appearance.decorations = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
      }));
    new Setting(containerEl).setName("表格默认对齐").setDesc("仅设置未单独指定位置的表格默认对齐；单个表格请在编辑页面的表格工具栏中设置。")
      .addDropdown(dropdown => dropdown.addOptions({ left: "居左", center: "居中", right: "居右" })
        .setValue(state.appearance.tableAlignment || "left").onChange(value => {
          state.appearance.tableAlignment = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
        }));
    new Setting(containerEl).setName("代码块行号").setDesc("阅读视图、分页和导出中显示行号；围栏里写 {2,5} 可高亮指定行。")
      .addToggle(toggle => toggle.setValue(Boolean(state.codeLineNumbers)).onChange(value => {
        state.codeLineNumbers = value; plugin.applyCodeLineNumbers(); plugin.saveStoredState();
      }));

    new Setting(containerEl).setName("编辑").setHeading();
    new Setting(containerEl).setName("智能标点").setDesc("输入 -- 转为 —、... 转为 …；代码块与行内代码不转换。")
      .addToggle(toggle => toggle.setValue(Boolean(state.smartPunctuation)).onChange(value => {
        state.smartPunctuation = value; plugin.saveStoredState();
      }));
    new Setting(containerEl).setName("粘贴图片存入 assets/").setDesc("关闭后交给 Obsidian 按「文件与链接」设置处理。开启时保存到笔记同级的 assets/，按笔记名加序号命名，GIF 保持原格式。")
      .addToggle(toggle => toggle.setValue(state.fileTools.convertPastedImages !== false).onChange(value => {
        state.fileTools.convertPastedImages = value; plugin.saveStoredState();
      }));

    new Setting(containerEl).setName("剪藏").setHeading();
    new Setting(containerEl).setName("回到 Obsidian 时检测剪贴板里的链接").setDesc("在其他 App 里复制文章链接后切回 Obsidian，提示一键剪藏到 00-剪藏/。iPhone 上建议先在「设置 → Obsidian → 从其他 App 粘贴」选「允许」，否则每次都会弹出粘贴确认。")
      .addToggle(toggle => toggle.setValue(Boolean(state.webClip?.watchClipboard)).onChange(value => {
        state.webClip.watchClipboard = value; plugin.saveStoredState();
      }));

    new Setting(containerEl).setName("标签页").setHeading();
    new Setting(containerEl).setName("在新标签页打开文件").setDesc("从文件列表或内部链接打开文件时新建标签页。")
      .addToggle(toggle => toggle.setValue(Boolean(state.tabs.openInNewTab)).onChange(value => {
        state.tabs.openInNewTab = value; plugin.saveStoredState(); this.display();
      }));
    if (state.tabs.openInNewTab) {
      new Setting(containerEl).setName("已打开时切换过去").setDesc("文件已在某个标签页中打开时，切换到那个标签页，不再新建。")
        .addToggle(toggle => toggle.setValue(Boolean(state.tabs.deduplicateTabs)).onChange(value => {
          state.tabs.deduplicateTabs = value; plugin.saveStoredState();
        }));
    }

    if (Platform.isMacOS) {
      new Setting(containerEl).setName("文件").setHeading();
      new Setting(containerEl).setName("「用…打开」的程序").setDesc("每行一个应用名称或 .app 路径，会出现在文件右键菜单中。")
        .addTextArea(text => {
          text.setPlaceholder("Visual Studio Code\nPreview\n/Applications/Typora.app")
            .setValue((state.fileTools.apps || []).join("\n"))
            .onChange(value => {
              state.fileTools.apps = [...new Set(value.split("\n").map(item => item.trim()).filter(Boolean))];
              plugin.saveStoredState();
            });
          text.inputEl.rows = 4;
        });
    }
  }
}


export { IgnoranceSettingTab };
