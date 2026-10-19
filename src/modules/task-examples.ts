import type { IgnorancePlugin } from "../plugin-types.js";
import { Modal, Notice, TFile } from "obsidian";
/* Four example notes organised by the job they get done. Nothing is written until one is chosen, and each goes
   into its own folder so it never touches existing notes. */
export const EXAMPLE_FOLDER = "Ignorance 示例";

interface TaskExample { id: string; title: string; summary: string; body: string }

export const TASK_EXAMPLES: TaskExample[] = [
  { id: "weekly", title: "写一篇周报", summary: "指标卡、任务状态、时间线和表格，一页讲清本周进展。", body: [
    "---", "cssclasses: [ib-compact]", "---", "# 本周周报", "",
    ":::kpi", "- **86%** _+12%_ 完成率", "- **3** 个风险", "- **5** 天", ":::", "",
    "## 本周完成", "", "- [x] 上线新版首页", "- [-] 取消旧活动页", "- [>] 数据看板推迟到下周", "- [!] 周五前提交预算", "",
    "## 进展时间线", "", "::: timeline", "- 周一：需求评审", "- 周三：联调", "- 周五：上线", ":::", "",
    "## 数据", "", "| 指标 | 本周 | 上周 |", "| --- | ---: | ---: |", "| 访问量 | 12,400 | 10,100 |", "| 转化率 | 6.2% | 5.4% |", "",
    "表：本周关键指标 {#tab-weekly}", "", "详见 ((ref:tab-weekly))。", ""].join("\n") },
  { id: "deck", title: "准备十页演示", summary: "用标题分页，封面、要点、图表和总结的骨架。", body: [
    "---", "cssclasses: [ib-slides]", "---", "# 项目汇报", "", "副标题：2026 年度回顾", "", "---", "",
    "## 目标", "", "- 讲清一件事", "- 每页一个观点", "", "---", "",
    "## 数据", "", "```echarts", "{ \"xAxis\": { \"data\": [\"一月\", \"二月\", \"三月\"] }, \"yAxis\": {}, \"series\": [{ \"type\": \"bar\", \"data\": [5, 8, 12] }] }", "```", "", "---", "",
    "## 总结", "", "- 结论先行", "- 下一步行动", ""].join("\n") },
  { id: "word", title: "把资料交付为 Word", summary: "标题编号、题注与交叉引用、目录，导出前先看预检报告。", body: [
    "---", "cssclasses: [ib-numbered, ib-captions]", "---", "# 项目方案", "", "[toc]", "",
    "## 背景", "", "说明为什么做这件事。", "", "## 方案", "", "整体流程如下，排期见 ((ref:tab-plan))。", "",
    "```mermaid", "flowchart LR", "A[需求] --> B[设计] --> C[交付]", "```", "", 
    "## 排期", "", "| 阶段 | 时间 |", "| --- | --- |", "| 设计 | 第 1 周 |", "| 交付 | 第 3 周 |", "",
    "表：排期 {#tab-plan}", "", "> 导出前：点导出，先看预览窗口顶部的检查报告。", ""].join("\n") },
  { id: "clip", title: "整理一篇剪藏", summary: "来源、摘要、重点高亮和待办，把剪下来的文章变成自己的笔记。", body: [
    "---", "source: ", "author: ", "tags: [剪藏]", "---", "# 文章标题", "",
    "> [!note] 一句话摘要", "> 写下这篇文章对你最有用的一点。", "",
    "## 重点", "", "- ==值得记住的句子==", "- <mark data-highlight=\"red\">需要核实的数据</mark>", "- 术语 ((ruby:示例 | shì lì))", "",
    "## 我的想法", "", "- [ ] 查证来源", "- [ ] 整理进相关笔记", ""].join("\n") }
];

class ExamplesModal extends Modal {
  constructor(private plugin: IgnorancePlugin) { super(plugin.app); }
  onOpen() {
    this.setTitle("新建任务式示例");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: `选一个，会在「${EXAMPLE_FOLDER}」文件夹里新建一篇，不改动已有笔记。` });
    for (const example of TASK_EXAMPLES) {
      const row = this.contentEl.createDiv({ cls: "ibp-layout-row" });
      const label = row.createDiv({ cls: "ibp-layout-name" });
      label.createDiv({ text: example.title });
      label.createDiv({ cls: "ib-form-hint", text: example.summary });
      row.createEl("button", { cls: "mod-cta", text: "新建" }).addEventListener("click", () => { this.close(); void createExample(this.plugin, example); });
    }
  }
  onClose() { this.contentEl.empty(); }
}

export async function createExample(plugin: IgnorancePlugin, example: TaskExample) {
  const vault = plugin.app.vault;
  if (!vault.getAbstractFileByPath(EXAMPLE_FOLDER)) await vault.createFolder(EXAMPLE_FOLDER);
  let path = `${EXAMPLE_FOLDER}/${example.title}.md`;
  for (let index = 2; vault.getAbstractFileByPath(path); index += 1) path = `${EXAMPLE_FOLDER}/${example.title} ${index}.md`;
  const file = await vault.create(path, example.body);
  if (file instanceof TFile) await plugin.app.workspace.getLeaf("tab").openFile(file);
  new Notice(`已新建：${path}`);
}

export function openTaskExamples(plugin: IgnorancePlugin) { new ExamplesModal(plugin).open(); }
