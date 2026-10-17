import type { IgnorancePlugin } from "../plugin-types.js";
import { Notice, normalizePath } from "obsidian";
/* A one-page reference of everything the plugin and theme add to Markdown. It is written into the vault only
   when the user runs the command (never automatically), and opened if it already exists. */

export const GUIDE_PATH = "Ignorance 语法速查.md";

export const GUIDE_TEXT = `---
cssclasses:
  - ib-compact
---
# Ignorance 语法速查

这份笔记由命令「打开语法速查」生成，可以随意编辑或删除。下面每一段都是可直接复制的写法。

## 页面版式

在笔记属性 \`cssclasses\` 里加入：\`ib-wide\`（加宽）、\`ib-narrow\`（收窄）、\`ib-compact\`（段落更紧凑）、\`ib-no-title\`（隐藏内联标题）。

另外：\`ib-cover\` 在阅读视图顶部按属性生成封面；\`ib-cards\` 把每个二级标题的小节画成卡片；\`ib-numbered\` 给标题编号；\`ib-captions\` 给图片和表格加题注。

## 行内组件

- 状态：((green:完成)) ((amber:进行中)) ((red:阻塞)) ((blue:信息)) ((gray:搁置))
- 两段徽章：((green:构建 | 通过)) ((版本 | 1.0))
- 进度条：((bar:72:交付))
- 趋势线：((spark:3,5,2,8,6))
- 点击显示：答案是 ((spoiler:四十二))
- 注音：((ruby:汉字 | hànzì))
- 面包屑（点击复制路径）：((crumb:设置 > 外观 > 主题))
- 图标：:bolt: :chart:
- 彩色高亮：==🟢绿色== ==🔴红色== ==🟡黄色==
- 在表格单元格里写两段徽章或注音时，把竖线写成 \\| ，例如 \`((green:CI \\| 通过))\`。

## 容器

\`\`\`\`md
::: tip 小提示
提示、警告等标注块：note、tip、info、success、warning、danger、question、caution、important。
:::

::: cols
::: col
左栏
:::
::: col
右栏
:::
:::

::: tabs
::: tab 第一页
内容
:::
::: tab 第二页
内容
:::
:::
\`\`\`\`

图片对比：把两张图片放进 \`::: compare\`，拖动中间的分隔线对比（导出时并排显示）。

其他容器：\`card\`、\`panel\`、\`details\`、\`timeline\`、\`steps\`、\`kpi\`、\`gallery\`、\`process\`、\`matrix\`、\`roadmap\`。在命令面板输入「插入块模板」可以直接插入。

## 图表与图片

- 代码块语言写 \`mermaid\` 或 \`echarts\` 即可渲染；在围栏上可以写 \`{align=center} {width=560}\` 设置对齐和宽度。
- 图片的 alt 里写 \`left\` 或 \`right\` 可以让图片靠左或靠右。
- 图片滤镜写在 alt 里：\`![gray](a.png)\` 灰度、\`sepia\` 复古、\`invert\` 反色、\`dark-invert\` 只在深色模式下反色（适合黑色线稿）、\`blur\` 模糊（鼠标移上去恢复）。可以和对齐、宽度一起写，如 \`![left|gray|400](a.png)\`。
- GIF 点击播放：alt 里写 \`click\`，如 \`![click|400](a.gif)\`。

## 表格

- 单元格里只写 \`<\` 并入左边、只写 \`^\` 并入上方；只写 \`[ ]\` 或 \`[x]\` 显示为方框。
- 右对齐的列（\`---:\`）里，五位以上的整数自动加千分位，\`72%\` 画成进度条。
- 第一格以 \`>\` 开头的行是上一行的子行（\`>>\` 是更深一层），上一行会出现折叠按钮。
- 超过 16 行的表格在阅读视图里自带滚动框，表头保持冻结。

## 阅读辅助

- 表格十字高亮：设置里打开，或笔记属性 \`cssclasses\` 写 \`ib-crosshair\`。
- 长代码块自动折叠：设置里打开，超过 40 行的代码块默认折叠。
- 未发布内容：把标题整个划掉，如 \`## ~~草稿~~\`，这一节在分页阅读和导出里会被隐藏。

## 题注与交叉引用

在设置里打开「图表题注与编号」（或在笔记属性 \`cssclasses\` 里写 \`ib-captions\`）后：独占一行的图片 \`![架构图 {#fig-arch}](a.png)\` 显示为「图 1 架构图」；表格下一行写 \`表：季度营收 {#tab-q}\` 显示为「表 1 季度营收」；代码块下一行写 \`代码：说明\`、公式（\`$$\`）下一行写 \`公式：说明\` 同样编号；正文里写 \`((ref:fig-arch))\` 引用，点击跳转。

## 演示与导出

- 用单独一行 \`---\` 分隔幻灯片，再点页面工具栏里的「演示」。
- 页面工具栏的导出按钮可生成 PDF、Word、PPT、图片和离线 HTML 阅读器。
`;

export async function openSyntaxGuide(plugin: IgnorancePlugin) {
  const { vault, workspace } = plugin.app;
  const path = normalizePath(GUIDE_PATH);
  let file = vault.getFileByPath(path);
  if (!file) {
    file = await vault.create(path, GUIDE_TEXT);
    new Notice(`已生成「${GUIDE_PATH}」`);
  }
  await workspace.getLeaf("tab").openFile(file);
}

export function showFirstRunHint(plugin: IgnorancePlugin) {
  if (plugin.state.introShown) return;
  plugin.state.introShown = true;
  plugin.saveStoredState();
  new Notice("插件已启用。在命令面板运行「打开语法速查」可以查看全部写法。", 10000);
}
