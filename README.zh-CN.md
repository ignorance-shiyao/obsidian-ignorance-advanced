<div align="center">

# Ignorance Advanced

**[Ignorance 主题](https://community.obsidian.md/themes/ignorance)的配套插件：** 图表、表格、图片、演示与导出，一次到位。

[English](README.md) · [支持作者](#支持)

![License](https://img.shields.io/github/license/ignorance-shiyao/obsidian-ignorance-advanced?color=4D81EF)
![Release](https://img.shields.io/github/v/release/ignorance-shiyao/obsidian-ignorance-advanced?color=4D81EF)

<img src="docs/assets/hero.jpg" alt="Ignorance Advanced：图表、代码、表格、图片、演示与导出" width="820">

</div>

> 外观由主题负责，插件只做 CSS 做不到的事。插件也能配合其他主题使用，但控件是按本主题的设计变量做的，换主题后会朴素一些。

## 配色：八套，一键切换

在插件设置里选择 Azure、Pine、Book、Graphite、Terracotta、Teal、Wisteria、Amber，浅色深色各自调校。

<div align="center">
<img src="docs/assets/palettes-light.gif" alt="浅色模式切换配色（录屏）" width="400"> <img src="docs/assets/palettes-dark.gif" alt="深色模式切换配色（录屏）" width="400">
</div>

## 功能

### Mermaid 增强
使用 Obsidian 自带的 Mermaid，随主题明暗与配色自动换色。每个图可缩放、复制或编辑源码、左中右定位、拖拽调宽（写在围栏上：`{align=center} {width=560}`）。

### ECharts 增强
Apache ECharts 代码块直接渲染成图，同样跟随主题配色，操作与 Mermaid 一致。

<div align="center">
<img src="docs/assets/diagrams.jpg" alt="跟随主题的 Mermaid 与 ECharts" width="820">
</div>

### 表格增强
拖拽列边与行边，带吸附顿挫（适应内容宽度或等分，Alt 自由拖动，Shift 以 10 px 步进）；尺寸菜单可一键适应内容、等分、撑满正文、重置；双击边线适应内容；左中右定位；按钮仅在悬停时出现，手机端同样可用。

### 演示（PPT）
用 `---` 分页，直接把一篇笔记变成演示文稿：全屏放映、图表与代码块原样上页，并可**导出 PPTX** 或打印成分页 PDF。笔记始终是纯 Markdown，随时可编辑。

<div align="center">
<img src="docs/assets/light-slides.jpg" width="420"> <img src="docs/assets/dark-slides.jpg" width="420">
</div>

### 代码块
可搜索的语言选择器（输入 `py`、`ts`、`sql`）、130+ 种语言、语言图标、行号、复制、折行；文件树同样带 Material Icon Theme 文件图标，文件夹的打开/关闭/空状态各不相同。

### 图片
对齐、八向缩放、复制、删除，以及**裁切**（裁切后选择替换原图或新增一张）。

<div align="center">
<img src="docs/assets/code-tables-images.jpg" alt="语言选择、列宽拖拽与图片工具栏" width="820">
</div>

### 阅读与导出
页面工具栏（正文宽度、纸张、页边距、页码、分页阅读，与 PDF 输出一致）；导出 PDF、Word、PPT、图片，以及带目录、搜索和明暗切换的离线 HTML 阅读器。Word 字体可在设置中选择微软雅黑、跟随主题或宋体；HTML 阅读器通过网址片段记住明暗与宽度，刷新后恢复，不使用浏览器存储。

<div align="center">
<img src="docs/assets/slides-export.jpg" alt="演示、页面工具栏与导出格式" width="820">
</div>

### 其他
标签页复用、打字机与专注模式、智能标点、彩色高亮（`==🟢文字==`）、网页剪藏、从 Word/PDF/Excel/PPT 等导入 Markdown（桌面端）。

## 桌面与手机

<div align="center">
<img src="docs/assets/desktop-mobile.jpg" alt="桌面与手机上的同一套工具" width="820">
<br><br>
<img src="docs/assets/mobile.gif" alt="手机上的图表、演示与代码工具" width="360">
</div>

## 安装

- **社区插件**：设置 → 第三方插件 → 浏览，搜索 “Ignorance Advanced”（[插件页面](https://community.obsidian.md/plugins/ignorance-advanced)）。
- **手动**：从[最新发布](https://github.com/ignorance-shiyao/obsidian-ignorance-advanced/releases/latest)下载 `main.js`、`manifest.json`、`styles.css`，放入 `<库>/.obsidian/plugins/ignorance-advanced/` 后启用。
- **主题**：在 设置 → 外观 安装 [Ignorance](https://community.obsidian.md/themes/ignorance) 以获得完整外观。

需要 Obsidian 1.8.7 及以上，支持桌面与手机；Word/PDF 导入等部分功能仅桌面端可用。

## 使用

- **图表**：写一个语言为 `mermaid` 或 `echarts` 的代码块，在实时预览和阅读视图中会自动渲染；悬停可缩放、复制、编辑源码、调整对齐，拖动边缘可调整宽度。
- **表格**：拖动列边或行边调整大小；按住 Alt 自由拖动，按住 Shift 以 10 px 步进，双击边线适应内容。
- **图片**：点击图片可对齐、缩放或裁切。
- **代码块**：点击语言标签可搜索语言；行号和折行在代码块工具栏里。
- **演示**：用单独一行 `---` 分隔幻灯片，然后点笔记顶部页面工具栏里的"演示"按钮（或在命令面板运行"打开演示模式"）。
- **放映辅助**：演示工具栏和全屏浮条里有激光笔（红点跟随鼠标）和聚光灯（只照亮鼠标周围），再点一次关闭；「逐段显示」让下一页先显示下一段内容；「安静视图」隐藏工具栏，鼠标移到顶部时再显示。
- **行内组件**：`((green:构建 | 通过))` 两段徽章，`((spoiler:答案))` 点击显示，`((ruby:汉字 | hànzì))` 注音，`((crumb:设置 > 外观 > 主题))` 面包屑，另有 `((bar:72:进度))` 进度条与 `((spark:3,5,2))` 趋势线。
- **图片对比**：把两张图片放进 `::: compare`，阅读视图里拖动分隔线对比，导出时并排显示。
- **GIF 点击播放**：在 GIF 的 alt 里写 `click`（如 `![click|400](a.gif)`），平时只显示第一帧和播放标记，点一下开始播放，再点停止；导出时保持静止首帧。
- **图片滤镜**：在图片的 alt 里写 `gray`（灰度）、`sepia`（复古）、`invert`（反色）、`dark-invert`（深色模式下反色）、`blur`（模糊，悬停恢复），如 `![left|gray|400](a.png)`。
- **页签**：用 `::: tabs` 包住若干 `::: tab 标题`，阅读视图里点标题切换，打印和导出时按顺序全部展开。
- **表格**增强：单元格里只写 `<` 并入左边的格子，只写 `^` 并入上方的格子；只写 `[ ]` 或 `[x]` 显示为方框。右对齐的列（`---:`）里，五位以上的整数自动加千分位，`72%` 画成进度条；第一格以 `>` 开头的行是上一行的子行，上一行出现折叠按钮；超过 16 行的表格在阅读视图里自带滚动框，表头保持冻结。
- **题注与交叉引用**：设置里打开「图表题注与编号」，或在笔记属性 `cssclasses` 里写 `ib-captions`。独占一行的图片 `![架构图 {#fig-arch}](a.png)` 显示为「图 1 架构图」，表格下一行写 `表：季度营收 {#tab-q}` 显示为「表 1 季度营收」，代码块下一行写 `代码：说明`、公式下一行写 `公式：说明` 同样编号（实时预览里也显示标签），正文里用 `((ref:fig-arch))` 引用，点击跳转。
- **卡片版式**：笔记属性 `cssclasses` 里写 `ib-cards`，阅读视图里每个二级标题的小节显示成一张卡片。
- **表格十字高亮**：设置里打开，或在笔记属性 `cssclasses` 里写 `ib-crosshair`，阅读视图里鼠标指到单元格时高亮它所在的行和列。
- **长代码块自动折叠**：设置里打开后，阅读视图里超过 40 行的代码块只显示前一部分，点「展开全部」查看；分页阅读和导出始终完整。
- **未发布内容**：把标题整个划掉（`## ~~草稿~~`），这一节（含下级小节）在阅读视图里变淡并标「未发布」，分页阅读和导出时整节隐藏，也不占编号。
- **标题编号**：设置里打开「标题自动编号」，或在笔记属性 `cssclasses` 里写 `ib-numbered`，标题前显示 1、1.1、1.1.1（阅读视图和实时预览都有；设置里可改成「一、（一）」风格）。
- **导航**：命令「跳到标题、图表、表格或代码」列出当前笔记的标题、图片、表格、代码块和图表，输入关键字筛选，回车跳转。
- **导航侧栏**：命令「在侧栏打开导航」把同样的列表常驻在右侧栏，跟随当前笔记，边输入边筛选，点击跳转。
- **检查链接**：命令面板运行「检查当前笔记的链接和标题」，列出不存在的笔记、嵌入、标题锚点和同级重名标题，点一行跳到对应位置。
- **批量剪藏**：命令「批量剪藏网页」一次粘贴多个链接，已剪藏过的自动跳过；设置里可选「按网站分类」，在剪藏文件夹下按网站名建子文件夹。
- **灰度日期**：设置里填写日期（如 `4-4`），当天整个界面变为灰度；默认不启用。
- **阅读时长**：桌面端状态栏显示当前笔记的预计阅读时间，可在设置里关闭。
- **封面**：在笔记属性 `cssclasses` 里写 `ib-cover`，阅读视图顶部按属性（`title`、`subtitle` 或 `description`、`author`、`date` 或 `created`、`tags`）生成封面，并隐藏内联标题。
- **页脚**：页面设置菜单里的「页脚」可以在分页阅读、导出的每一页底部左侧写文字，支持 `{title}`、`{page}`、`{pages}`、`{date}`。
- **版式预设**：页面设置菜单里的「版式预设」一键套用论文、汇报、公文、博客的纸张、页边距和页码，之后仍可逐项调整。
- **起始页与功能样例页**（下个版本）：「打开起始页」列出写周报、做演示、交付 Word、整理剪藏四件事，每件配一个可直接新建的示例；「生成功能样例页」生成一份可复制的主题与插件样例笔记。
- **导出支持表**（下个版本）：「查看导出支持表」列出每种内容在各个导出格式里会怎样；导出预览顶部的检查会指出当前笔记里的具体行。
- **自己的模板**（下个版本）：在设置「模板与语言」里指定文件夹，放进 Markdown 模板，用「从模板新建笔记」套用；可用 `{{title}}`、`{{author}}`、`{{date}}`、`{{time}}`，属性里写 `ib-layout: 版式名` 会套用已保存的版式。「导出模板包」「导入模板包」可在不同库之间搬运模板和版式。
- **脚本接口**（下个版本）：`app.plugins.plugins["ignorance-advanced"].api` 提供 `exportNote`、`createNote`、`checkNote`、`listLayouts`、`listTemplates`，供 QuickAdd、Templater 或自己的脚本调用；调用要显式指定笔记、版式和格式，不会弹窗，返回 `{ ok, ... , warnings }` 而不是抛错。
- **界面语言**（下个版本）：设置里的「界面语言」可跟随 Obsidian，或固定为中文、English。命令名、工具栏、弹窗、通知、设置和导出的 HTML 阅读器都有英文；插入的模板示例文字、封面与文档里的标签也会随语言变化；文件名与文件夹名保持不变。
- **逐篇版式**（下个版本）：内置版式与已保存版式合并为一个菜单；在笔记属性里写 `ib-layout: 版式名`（或在菜单里固定），打开该笔记时套用该版式。
- **导出目录与拖出文件**（下个版本）：设置里可把导出存到任意文件夹；按住 Alt 把文件列表里的文件拖到其他软件（或直接拖导出文件夹里的文件），交出真正的文件。
- **多设备版式**（下个版本）：保存的版式带更新时间和删除标记，两台设备都改过时会合并，而不是一方覆盖另一方。
- **导出**：用页面工具栏的导出按钮生成 PDF、Word、PPT、图片或离线 HTML 阅读器。
- **设置**：设置 → Ignorance Advanced（配色、页面布局、高亮颜色、标签页行为）。

## 隐私与网络

- 无遥测、无统计、无广告。
- 插件不会下载或自行更新任何代码。Mermaid、PDF.js 和 HTML 转换用 Obsidian 自带的；ECharts、导出引擎等库打包在 `main.js` 里（约 3.6 MB），用到时才启动。
- 只有你主动操作时才会联网：剪藏网页、复制或导出图片链接、笔记里设置的封面图链接。
- **只在库内读写**：插件只通过 Obsidian 的库接口读写文件，不直接访问文件系统、其他程序或 Electron。导出文件保存在库内的 `导出/` 文件夹；桌面端导出 PDF 走系统打印窗口（选「存储为 PDF」）。桌面和手机功能一致。

## 反馈

使用中遇到问题，或有功能需求，欢迎[提交 issue](https://github.com/ignorance-shiyao/obsidian-ignorance-advanced/issues)；附上截图、Obsidian 版本和平台（桌面或手机）会更容易定位。

## 支持

如果它对你有用，欢迎请我喝杯咖啡，谢谢！

| 微信 | 支付宝 |
| --- | --- |
| ![微信](docs/assets/coffee-wechat.png) | ![支付宝](docs/assets/coffee-alipay.png) |

## 许可

[MIT](LICENSE)。第三方软件见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
