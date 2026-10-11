/* A one-page reference of everything the plugin and theme add to Markdown. It is written into the vault only
   when the user runs the command (never automatically), and opened if it already exists. */
const { Notice, normalizePath } = require("obsidian");

export const GUIDE_PATH = "Ignorance 语法速查.md";

export const GUIDE_TEXT = `---
cssclasses:
  - ib-compact
---
# Ignorance 语法速查

这份笔记由命令「打开语法速查」生成，可以随意编辑或删除。下面每一段都是可直接复制的写法。

## 页面版式

在笔记属性 \`cssclasses\` 里加入：\`ib-wide\`（加宽）、\`ib-narrow\`（收窄）、\`ib-compact\`（段落更紧凑）、\`ib-no-title\`（隐藏内联标题）。

## 行内组件

- 状态：((green:完成)) ((amber:进行中)) ((red:阻塞)) ((blue:信息)) ((gray:搁置))
- 两段徽章：((green:构建 | 通过)) ((版本 | 1.0))
- 进度条：((bar:72:交付))
- 趋势线：((spark:3,5,2,8,6))
- 点击显示：答案是 ((spoiler:四十二))
- 注音：((ruby:汉字 | hànzì))
- 面包屑：((crumb:设置 > 外观 > 主题))
- 图标：:bolt: :chart:
- 彩色高亮：==🟢绿色== ==🔴红色== ==🟡黄色==

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

其他容器：\`card\`、\`panel\`、\`details\`、\`timeline\`、\`steps\`、\`kpi\`、\`gallery\`、\`process\`、\`matrix\`、\`roadmap\`。在命令面板输入「插入块模板」可以直接插入。

## 图表与图片

- 代码块语言写 \`mermaid\` 或 \`echarts\` 即可渲染；在围栏上可以写 \`{align=center} {width=560}\` 设置对齐和宽度。
- 图片的 alt 里写 \`left\` 或 \`right\` 可以让图片靠左或靠右。

## 演示与导出

- 用单独一行 \`---\` 分隔幻灯片，再点页面工具栏里的「演示」。
- 页面工具栏的导出按钮可生成 PDF、Word、PPT、图片和离线 HTML 阅读器。
`;

export async function openSyntaxGuide(plugin) {
  const { vault, workspace } = plugin.app;
  const path = normalizePath(GUIDE_PATH);
  let file = vault.getFileByPath(path);
  if (!file) {
    file = await vault.create(path, GUIDE_TEXT);
    new Notice(`已生成「${GUIDE_PATH}」`);
  }
  await workspace.getLeaf("tab").openFile(file);
}

export function showFirstRunHint(plugin) {
  if (plugin.state.introShown) return;
  plugin.state.introShown = true;
  plugin.saveStoredState();
  new Notice("插件已启用。在命令面板运行「打开语法速查」可以查看全部写法。", 10000);
}
