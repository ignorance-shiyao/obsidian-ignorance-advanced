import { chooseFolder, vaultBasePath } from "./desktop-files.js";
import { applyCustomCallouts } from "./custom-callouts.js";
import { releaseTableLayers } from "../plugin/table-sizes.js";
import { ENHANCEMENTS, noteOffClass } from "./enhancement-gate-core.js";
import { WORD_FONT_OPTIONS, normalizeWordFont } from "./word-font.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { MarkdownView, Notice, PluginSettingTab, Setting } from "obsidian";
import { setLanguagePreference, tr } from "../i18n.js";
import type { App } from "obsidian";
import * as Appearance from "./appearance.js";
import { LINE_HEIGHT_PRESETS } from "./line-height.js";
import { openSyntaxGuide } from "./syntax-guide.js";
const { applyAppearancePreferences } = Appearance;

export { installTabOpening } from "./tab-opening.js";

const PASTE_IMAGE_DESC = "关闭后交给 Obsidian 按「文件与链接」设置处理。开启时保存到笔记同级的 assets/，按笔记名加序号命名，GIF 保持原格式。";
const CLIPBOARD_DESC = "在其他 App 里复制文章链接后切回 Obsidian，提示一键剪藏到下面设置的文件夹。iPhone 上建议先在「设置 → Obsidian → 从其他 App 粘贴」选「允许」，否则每次都会弹出粘贴确认。";

/* Every setting is described once. Obsidian 1.13+ reads `getSettingDefinitions()` (which makes the rows
   searchable); older versions still call `display()`, which walks the same description. */
interface SettingItem {
  name: string;
  desc: string;
  aliases?: string[];
  visible?: () => boolean;
  add: (setting: Setting) => unknown;
}
interface SettingGroup { heading: string; items: SettingItem[] }

/** `update()` exists only on newer Obsidian setting tabs (1.13+). */
interface UpdatableSettingTab { update?: () => void }

type BooleanAppearanceKey = "hideHeadingLabels" | "headingBadge" | "decorations";

class IgnoranceSettingTab extends PluginSettingTab {
  plugin: IgnorancePlugin;

  constructor(app: App, plugin: IgnorancePlugin) { super(app, plugin); this.plugin = plugin; }

  settingGroups(): SettingGroup[] {
    const plugin = this.plugin;
    const state = plugin.state;
    const rerenderPreviews = () => {
      for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
        if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
      }
    };
    const refreshAppearance = () => { applyAppearancePreferences(plugin); plugin.app.workspace.trigger("css-change"); plugin.saveStoredState(); };
    const toggle = (get: () => boolean, set: (value: boolean) => void) => (setting: Setting) => setting.addToggle(control => control.setValue(get()).onChange(value => set(value)));
    const appearanceToggle = (get: () => boolean, key: BooleanAppearanceKey) => toggle(get, value => { state.appearance[key] = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); });

    // 主题预设与主题色只在左下角调色板中设置；明暗模式用左下角按钮或 Obsidian 外观设置。
    const groups: SettingGroup[] = [
      { heading: tr("增强范围"), items: ENHANCEMENTS.map(({ kind, label, desc }) => ({
        name: tr(label), desc: tr("{desc}关闭后新渲染的内容不再增强；只想关某一篇，在笔记属性 cssclasses 里加 {cls}。", { desc: tr(desc), cls: noteOffClass(kind) }),
        add: toggle(() => state.enhance?.[kind] !== false, value => {
          state.enhance = { ...state.enhance, [kind]: value ? undefined : false };
          if (kind === "tables" && !value) releaseTableLayers(plugin);
          plugin.saveStoredState(); refreshAppearance(); rerenderPreviews(); plugin.app.workspace.updateOptions();
        })
      })) },
      { heading: tr("排版"), items: [
        { name: tr("行距"), desc: tr("同时作用于阅读视图与编辑视图。"), aliases: ["line height"], add: (setting: Setting) => setting.addDropdown(dropdown => {
          for (const { value, label } of LINE_HEIGHT_PRESETS) dropdown.addOption(String(value), tr(label));
          dropdown.setValue(String(state.appearance.lineHeight)).onChange(value => { state.appearance.lineHeight = value; refreshAppearance(); });
        }) },
        { name: tr("卡片圆角"), desc: tr("代码块、图表和容器卡片的圆角，单位像素。"), add: (setting: Setting) => setting.addSlider(slider => slider.setLimits(0, 16, 1)
          .setValue(Number(state.appearance.cardRadius) || 0).setDynamicTooltip()
          .onChange(value => { state.appearance.cardRadius = value; applyAppearancePreferences(plugin); plugin.saveStoredState(); })) },
        { name: tr("隐藏标题级别标记"), desc: tr("阅读视图中不显示标题左侧的 H1–H6。"), add: appearanceToggle(() => Boolean(state.appearance.hideHeadingLabels), "hideHeadingLabels") },
        { name: tr("二级标题徽标"), desc: tr("阅读视图的二级标题前显示 # 徽标，默认关闭。"), add: appearanceToggle(() => Boolean(state.appearance.headingBadge), "headingBadge") },
        { name: tr("章节装饰"), desc: tr("显示章节卡片彩色竖条；关闭后保留正文与卡片布局。打印和减少动态效果时自动隐藏。"), add: appearanceToggle(() => state.appearance.decorations !== false, "decorations") },
        { name: tr("表格默认对齐"), desc: tr("仅设置未单独指定位置的表格默认对齐；单个表格请在编辑页面的表格工具栏中设置。"), add: (setting: Setting) => setting.addDropdown(dropdown =>
          dropdown.addOptions({ left: tr("居左"), center: tr("居中"), right: tr("居右") }).setValue(state.appearance.tableAlignment || "left").onChange(value => {
            state.appearance.tableAlignment = value; applyAppearancePreferences(plugin); plugin.saveStoredState();
          })) },
        { name: tr("漏打空行时仍识别表格"), desc: tr("表格紧贴在段落下面（中间没空行）时，阅读视图、分页和导出仍按表格显示；编辑时停笔后会自动补上空行。已有笔记可用命令「补全缺失的空行」一次补齐。"), aliases: ["lenient blocks", "missing blank line"], add: toggle(() => state.lenientBlocks !== false, value => {
          state.lenientBlocks = value; plugin.saveStoredState();
          rerenderPreviews();
        }) },
        { name: tr("标题自动编号"), desc: tr("阅读视图的标题前显示 1、1.1、1.1.1 这样的编号；也可以只在某篇笔记的 cssclasses 里写 ib-numbered（写 ib-unnumbered 则关闭）。"), aliases: ["heading numbers"], add: toggle(() => state.headingNumbers === true, value => {
          state.headingNumbers = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
          rerenderPreviews();
        }) },
        { name: tr("表格十字高亮"), desc: tr("阅读视图里鼠标指到单元格时，高亮它所在的行和列。也可以只在某篇笔记的 cssclasses 里写 ib-crosshair。"), aliases: ["table crosshair"], add: toggle(() => state.tableCrosshair === true, value => { state.tableCrosshair = value; plugin.saveStoredState(); }) },
        { name: tr("长代码块自动折叠"), desc: tr("阅读视图里超过 40 行的代码块默认只显示前 20 行，点「展开全部」查看完整内容。"), aliases: ["fold long code"], add: toggle(() => state.autoFoldCode === true, value => {
          state.autoFoldCode = value; plugin.saveStoredState();
          rerenderPreviews();
        }) },
        { name: tr("标题编号风格"), desc: tr("「1.1」是 1、1.1、1.1.1；「一、」是 一、（一）、1.、（1）。"), aliases: ["heading number style"], add: (setting: Setting) => setting.addDropdown(dropdown => dropdown
          .addOptions({ decimal: "1.1", chinese: tr("一、（一）") }).setValue(state.headingNumberStyle || "decimal").onChange(value => {
            state.headingNumberStyle = value === "chinese" ? "chinese" : "decimal"; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            rerenderPreviews();
          })) },
        { name: tr("标题编号起始级别"), desc: tr("「自动」：只有一个 H1 时把它当作笔记标题，从 H2 开始编号；「从 H1」：所有标题都编号；「从 H2」：H1 一律不编号。"), aliases: ["heading number start"], add: (setting: Setting) => setting.addDropdown(dropdown => dropdown
          .addOptions({ auto: tr("自动"), h1: tr("从 H1"), h2: tr("从 H2") }).setValue(state.headingNumberStart || "auto").onChange(value => {
            state.headingNumberStart = value === "h1" || value === "h2" ? value : "auto"; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            rerenderPreviews();
          })) },
        { name: tr("笔记已有编号时不再自动编号"), desc: tr("标题本身已经写了编号（1、1.1、一、（一）、第三章、①、A. 等）时，这篇笔记不再叠加自动编号；关闭后仍会添加。"), aliases: ["skip numbered headings"], add: toggle(() => state.headingNumberSkipOwn !== false, value => {
          state.headingNumberSkipOwn = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
          rerenderPreviews();
        }) },
        { name: tr("标题编号层级"), desc: tr("最多编到第几层，更深的标题不编号。"), aliases: ["heading number depth"], add: (setting: Setting) => setting.addDropdown(dropdown => dropdown
          .addOptions({ 1: tr("1 层"), 2: tr("2 层"), 3: tr("3 层"), 4: tr("4 层"), 5: tr("5 层"), 6: tr("6 层") }).setValue(String(state.headingNumberDepth || 4)).onChange(value => {
            state.headingNumberDepth = Number(value); plugin.saveStoredState(); plugin.app.workspace.updateOptions();
            rerenderPreviews();
          })) },
        { name: tr("图表题注与编号"), desc: tr("阅读视图里给图片和表格加「图 1」「表 1」题注并支持 ((ref:标识)) 交叉引用；图片的 alt 作为图注，表格下一行写「表：说明」。也可以只在某篇笔记的 cssclasses 里写 ib-captions。"), aliases: ["captions", "figure numbers"], add: toggle(() => state.captions === true, value => {
          state.captions = value; plugin.saveStoredState(); plugin.app.workspace.updateOptions();
          rerenderPreviews();
        }) },
        { name: tr("代码块行号"), desc: tr("阅读视图、分页和导出中显示行号；围栏里写 {2,5} 可高亮指定行。"), aliases: ["line numbers"], add: toggle(() => Boolean(state.codeLineNumbers), value => {
          state.codeLineNumbers = value; plugin.applyCodeLineNumbers(); plugin.saveStoredState();
        }) }
      ] },
      { heading: tr("导出"), items: [
        { name: tr("Word 导出字体"), desc: tr("用于导出文档的正文与标题。跟随主题时，正文与标题统一使用当前正文字体，需本机安装相应字体；代码保持独立的等宽字体。"), aliases: ["word font", "docx"], add: (setting: Setting) => setting.addDropdown(dropdown => {
          for (const [value, label] of WORD_FONT_OPTIONS) dropdown.addOption(value, tr(label));
          dropdown.setValue(normalizeWordFont(state.wordFont)).onChange(value => { state.wordFont = normalizeWordFont(value); plugin.saveStoredState(); });
        }) }
      ] },
      { heading: tr("编辑"), items: [
        { name: tr("智能标点"), desc: tr("输入 -- 转为 —、... 转为 …；代码块与行内代码不转换。"), add: toggle(() => Boolean(state.smartPunctuation), value => { state.smartPunctuation = value; plugin.saveStoredState(); }) },
        { name: tr("选中文字后粘贴网址变成链接"), desc: tr("选中一段文字再粘贴网址，得到 [文字](网址)。"), add: toggle(() => state.pasteLink !== false, value => { state.pasteLink = value; plugin.saveStoredState(); }) },
        { name: tr("粘贴表格数据变成 Markdown 表格"), desc: tr("从 Excel、Numbers 等复制的单元格，粘贴时自动转为 Markdown 表格（代码块里不转换）。"), add: toggle(() => state.pasteTable !== false, value => { state.pasteTable = value; plugin.saveStoredState(); }) },
        { name: tr("粘贴图片存入 assets/"), desc: tr(PASTE_IMAGE_DESC), add: toggle(() => state.fileTools.convertPastedImages !== false, value => { state.fileTools.convertPastedImages = value; plugin.saveStoredState(); }) }
      ] },
      { heading: tr("外观"), items: [
        { name: tr("灰度日期"), desc: tr("这些日期整个界面变为灰度，每行一个，写成 月-日，例如 4-4。默认不启用。"), aliases: ["gray mode", "grayscale"], add: (setting: Setting) => setting.addTextArea((text) => {
          text.setPlaceholder("4-4\n9-18").setValue(state.grayDates || "").onChange(value => { state.grayDates = value; plugin.saveStoredState(); plugin.applyGrayMode?.(); });
          text.inputEl.rows = 3;
        }) }
      ] },
      { heading: tr("标注块"), items: [
        { name: tr("自定义标注块类型"), desc: tr("每行一个：名称 | 颜色 | 图标。例如 faq | #7C5CFF | help-circle。颜色可写 #RGB、#RRGGBB，或 info、warning、success、error 这四种主题配色；图标是 Lucide 图标名，可留空。之后在笔记里写 > [!faq] 就能用。"), aliases: ["custom callouts", "admonition"], add: (setting: Setting) => setting.addTextArea((text) => {
          const hint = setting.descEl.createDiv({ cls: "ib-form-hint" });
          text.setPlaceholder(tr("名称 | 颜色 | 图标")).setValue(state.customCallouts || "").onChange(value => {
            state.customCallouts = value; plugin.saveStoredState();
            const ignored = applyCustomCallouts(plugin);
            hint.setText(ignored.length ? tr("无法识别，已忽略：{list}", { list: ignored.slice(0, 3).join("；") }) : "");
          });
          text.inputEl.rows = 4;
        }) }
      ] },
      { heading: tr("状态栏"), items: [
        { name: tr("显示阅读时长"), desc: tr("在状态栏显示当前笔记的预计阅读时间（仅桌面端）。"), aliases: ["reading time"], add: toggle(() => state.readingTime?.enabled !== false, value => {
          state.readingTime.enabled = value; plugin.saveStoredState(); plugin.refreshReadingTime?.();
        }) }
      ] },
      { heading: tr("剪藏"), items: [
        { name: tr("回到 Obsidian 时检测剪贴板里的链接"), desc: tr(CLIPBOARD_DESC), add: toggle(() => Boolean(state.webClip?.watchClipboard), value => { state.webClip.watchClipboard = value; plugin.saveStoredState(); }) },
        { name: tr("剪藏文件夹"), desc: tr("网页剪藏的笔记和图片保存到这里，文件夹名同时作为笔记标签。默认 Clippings。"), aliases: ["clippings"], add: (setting: Setting) => setting.addText((text) => text.setPlaceholder("Clippings")
          .setValue(state.webClip?.folder || "").onChange((value) => { state.webClip.folder = value.trim(); plugin.saveStoredState(); })) },
        { name: tr("按网站分类"), desc: tr("剪藏时在剪藏文件夹下按网站名建子文件夹，例如 Clippings/example.com/。"), aliases: ["sort by site"], add: toggle(() => Boolean(state.webClip?.byDomain), value => { state.webClip.byDomain = value; plugin.saveStoredState(); }) }
      ] },
      { heading: tr("模板与语言"), items: [
        { name: tr("导出目录"), desc: tr("导出的 Word、PDF、HTML 等保存到这里。留空是库里的「导出」文件夹；填一个绝对路径（或点「选择…」）可存到库外，仅桌面端。"), aliases: ["export folder", "export directory"], add: (setting: Setting) => {
          let field: { setValue(value: string): unknown } | null = null;
          setting.addText(text => { field = text; text.setPlaceholder(tr("导出")).setValue(state.exportDir ?? "").onChange(value => { state.exportDir = value.trim(); plugin.saveStoredState(); }); });
          setting.addButton(button => button.setButtonText(tr("选择…")).onClick(() => void chooseFolder(state.exportDir ?? vaultBasePath(plugin)).then(dir => { if (dir) { state.exportDir = dir; field?.setValue(dir); plugin.saveStoredState(); } })));
        } },
        { name: tr("每次导出时选择保存位置"), desc: tr("开启后，每次导出都会弹出系统的「存储为」窗口，默认停在上次选的文件夹；取消则不导出。仅桌面端，开启后「导出目录」只作为首次的起点。"), aliases: ["ask where to save", "save as"], add: toggle(() => Boolean(state.exportAsk), value => { state.exportAsk = value; plugin.saveStoredState(); }) },
        { name: tr("拖出文件"), desc: tr("把文件列表里的文件拖到其他软件时，交出文件本身而不是 obsidian:// 地址。「按住 Alt」时只在按住 Alt 或文件在导出文件夹里时生效；库内拖动整理文件不受影响。"), aliases: ["drag out", "drag files"], add: (setting: Setting) => setting.addDropdown(dropdown => dropdown
          .addOption("alt", tr("按住 Alt")).addOption("always", tr("总是")).addOption("off", tr("关闭"))
          .setValue(state.dragOut ?? "alt").onChange(value => { state.dragOut = value === "always" || value === "off" ? value : "alt"; plugin.saveStoredState(); })) },
        { name: tr("模板文件夹"), desc: tr("放你自己的笔记模板（Markdown）的文件夹，用「从模板新建笔记」命令套用。模板里可用 {{title}}、{{author}}、{{date}}、{{time}}；在属性里写 ib-layout: 版式名 可在新建时套用版式。"), aliases: ["templates", "template folder"], add: (setting: Setting) => setting.addText(text => text.setPlaceholder("Templates")
          .setValue(state.userTemplates?.folder ?? "").onChange(value => { state.userTemplates.folder = value.trim(); plugin.saveStoredState(); })) },
        { name: tr("模板里的作者名"), desc: tr("填进模板的 {{author}}。"), add: (setting: Setting) => setting.addText(text => text
          .setValue(state.userTemplates?.author ?? "").onChange(value => { state.userTemplates.author = value.trim(); plugin.saveStoredState(); })) },
        { name: tr("界面语言"), desc: tr("插件界面的语言。「自动」跟随 Obsidian 的界面语言；改动后重新加载 Obsidian 才会完全生效。"), aliases: ["language", "locale"], add: (setting: Setting) => setting.addDropdown(dropdown => dropdown
          .addOption("auto", tr("自动")).addOption("zh", "中文").addOption("en", "English")
          .setValue(state.language ?? "auto").onChange(value => {
            state.language = value === "zh" || value === "en" ? value : "auto";
            setLanguagePreference(state.language); plugin.saveStoredState();
            new Notice(tr("重新加载 Obsidian 后完全生效"));
          })) }
      ] },
      { heading: tr("标签页"), items: [
        { name: tr("在新标签页打开文件"), desc: tr("从文件列表或内部链接打开文件时新建标签页。"), add: toggle(() => Boolean(state.tabs.openInNewTab), value => {
          state.tabs.openInNewTab = value; plugin.saveStoredState(); const tab = this as PluginSettingTab & UpdatableSettingTab; if (tab.update) tab.update(); else this.display();
        }) },
        { name: tr("已打开时切换过去"), desc: tr("文件已在某个标签页中打开时，切换到那个标签页，不再新建。"), visible: () => Boolean(state.tabs.openInNewTab),
          add: toggle(() => Boolean(state.tabs.deduplicateTabs), value => { state.tabs.deduplicateTabs = value; plugin.saveStoredState(); }) }
      ] }
    ];
    groups.push({ heading: tr("帮助"), items: [
      { name: tr("语法速查"), desc: tr("在库根目录生成一页写法速查笔记并打开；已存在则直接打开。"), aliases: ["syntax", "cheat sheet", tr("帮助")], add: (setting: Setting) => setting.addButton(button =>
        button.setButtonText(tr("打开")).onClick(() => void openSyntaxGuide(plugin))) }
    ] });
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
        render: (setting: Setting) => { setting.setName(item.name).setDesc(item.desc); item.add(setting); }
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
