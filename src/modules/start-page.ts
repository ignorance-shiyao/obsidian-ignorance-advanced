import { Modal, Notice, TFile, normalizePath } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { activeLanguage, tr } from "../i18n.js";
import { GALLERY_FILE, galleryText } from "./gallery-core.js";
import { EXAMPLE_FOLDER, TASK_EXAMPLES, createExample } from "./task-examples.js";
import { openSyntaxGuide } from "./syntax-guide.js";
/* The starting point: what you can do, as four jobs, each with the shortest path and a button that makes an
   example to try. It can be opened again at any time (命令 "打开起始页"), and the first-run notice offers it. */

/** Obsidian runs commands by id; the call exists but is not in the published typings. */
interface CommandHost { commands: { executeCommandById(id: string): boolean } }

interface Job { id: string; title: string; summary: string; steps: string[]; extra?: { label: string; commandId: string } }

const jobs = (): Job[] => [
  { id: "weekly", title: tr("写周报"), summary: tr("指标卡、任务状态、时间线和表格，一页讲清本周进展。"),
    steps: [tr("新建示例，看阅读视图里的效果"), tr("把满意的写法存进模板文件夹，下次「从模板新建笔记」"), tr("用任务状态 [x] [-] [>] [!] 标出进展")],
    extra: { label: tr("从模板新建笔记"), commandId: "template-new" } },
  { id: "deck", title: tr("做演示"), summary: tr("用 --- 分页，封面、要点、图表和总结的骨架。"),
    steps: [tr("新建示例"), tr("运行命令「在演示视图中打开当前笔记」"), tr("在导出菜单里选 PPTX")],
    extra: { label: tr("演示视图打开当前笔记"), commandId: "open-presentation-mode" } },
  { id: "word", title: tr("交付 Word"), summary: tr("标题编号、题注与交叉引用、目录，导出前先看检查报告。"),
    steps: [tr("新建示例"), tr("打开导出菜单，选「导出 Word」，先看预览窗口顶部的检查"), tr("不确定某种内容会不会丢，先看导出支持表")],
    extra: { label: tr("查看导出支持表"), commandId: "export-support-table" } },
  { id: "clip", title: tr("整理剪藏"), summary: tr("来源、摘要、重点高亮和待办，把剪下来的文章变成自己的笔记。"),
    steps: [tr("运行「剪藏网页」把文章存进库"), tr("新建示例，照着整理摘要和重点"), tr("很多链接时用「批量剪藏网页」")],
    extra: { label: tr("剪藏网页"), commandId: "clip-web-page" } }
];

async function createGallery(plugin: IgnorancePlugin) {
  const { vault, workspace } = plugin.app;
  if (!vault.getAbstractFileByPath(EXAMPLE_FOLDER)) await vault.createFolder(EXAMPLE_FOLDER);
  const name = tr(GALLERY_FILE);
  let path = normalizePath(`${EXAMPLE_FOLDER}/${name}.md`);
  for (let index = 2; vault.getAbstractFileByPath(path); index += 1) path = normalizePath(`${EXAMPLE_FOLDER}/${name} ${index}.md`);
  const file = await vault.create(path, galleryText(activeLanguage()));
  if (file instanceof TFile) await workspace.getLeaf("tab").openFile(file);
  new Notice(tr("已新建：{path}", { path }));
}

class StartPageModal extends Modal {
  constructor(private plugin: IgnorancePlugin) { super(plugin.app); }
  onOpen() {
    const { plugin } = this;
    this.setTitle(tr("开始使用 Ignorance"));
    this.modalEl.addClass("ibp-start-modal");
    this.contentEl.createDiv({ cls: "ib-form-hint", text: tr("选一件你要做的事。示例会放进「{folder}」文件夹，不改动已有笔记。", { folder: EXAMPLE_FOLDER }) });
    const grid = this.contentEl.createDiv({ cls: "ibp-start-grid" });
    for (const job of jobs()) {
      const card = grid.createDiv({ cls: "ibp-start-card" });
      card.createEl("h4", { text: job.title });
      card.createDiv({ cls: "ib-form-hint", text: job.summary });
      const steps = card.createEl("ol", { cls: "ibp-start-steps" });
      for (const step of job.steps) steps.createEl("li", { text: step });
      const buttons = card.createDiv({ cls: "ibp-start-buttons" });
      const example = TASK_EXAMPLES.find(item => item.id === job.id);
      if (example) buttons.createEl("button", { cls: "mod-cta", text: tr("新建示例") }).addEventListener("click", () => { this.close(); void createExample(plugin, example); });
      if (job.extra) {
        const { commandId } = job.extra;
        buttons.createEl("button", { text: job.extra.label }).addEventListener("click", () => { this.close(); (plugin.app as unknown as CommandHost).commands.executeCommandById(`${plugin.manifest.id}:${commandId}`); });
      }
    }
    const more = this.contentEl.createDiv({ cls: "ibp-start-more" });
    more.createEl("button", { text: tr("语法速查") }).addEventListener("click", () => { this.close(); void openSyntaxGuide(plugin); });
    more.createEl("button", { text: tr("生成功能样例页") }).addEventListener("click", () => { this.close(); void createGallery(plugin); });
  }
  onClose() { this.contentEl.empty(); }
}

export function openStartPage(plugin: IgnorancePlugin) { new StartPageModal(plugin).open(); }

export function installStartPage(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "open-start-page", name: tr("打开起始页"), icon: "lucide-rocket", callback: () => openStartPage(plugin) });
  plugin.addCommand({ id: "create-feature-gallery", name: tr("生成功能样例页"), icon: "lucide-layout-grid", callback: () => { void createGallery(plugin); } });
}
