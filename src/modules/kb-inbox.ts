import { Notice, Scope, TFile, TFolder } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, openNote, registerKbFeature } from "./kb.js";
import { formatDay } from "./kb-date-core.js";
import type { KbNote } from "./kb-index-core.js";
import { KB_ARCHIVE_SUBFOLDER, KB_CLIP_HEADING, KB_SNOOZE_KEY, appendUnderHeading, buildTopics, clipLine, clipSource, clipSummary, inboxQueue, suggestTopics, uniquePath } from "./kb-inbox-core.js";
import type { TopicProfile } from "./kb-inbox-core.js";
import { KB_INBOX_VIEW, kbViewShortcuts } from "./kb-home.js";
import { kbEmpty, kbHeader, kbIconButton } from "./kb-ui.js";

export { KB_INBOX_VIEW };

/* P0-2 Inbox digest (ig-kb-inbox): one clipping at a time, oldest first, filed with one action and undoable. */

type Step =
  | { kind: "move"; from: string; to: string }
  | { kind: "write"; path: string; before: string }
  | { kind: "create"; path: string }
  | { kind: "snooze"; path: string; before: unknown };

interface UndoEntry { label: string; steps: Step[]; focus: string }

class KbInboxView extends KbView {
  private current = "";
  private undo: UndoEntry[] = [];
  private busy = false;
  private queue: KbNote[] = [];
  private topics: TopicProfile[] = [];
  private suggestions: TopicProfile[] = [];
  private conclusion: HTMLInputElement | null = null;
  private summaryFor = "";
  private summary = "";

  constructor(leaf: WorkspaceLeaf, plugin: IgnorancePlugin) {
    super(leaf, plugin);
    this.scope = new Scope(this.app.scope);
    const key = (mods: ("Mod" | "Shift")[], k: string, run: () => void) => this.scope?.register(mods, k, event => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select") && k !== "z") return true;
      run();
      return false;
    });
    for (const n of [1, 2, 3]) key([], String(n), () => { const topic = this.suggestions[n - 1]; if (topic) void this.file(topic); });
    key([], "a", () => void this.archive());
    key([], "s", () => void this.snooze());
    key([], "ArrowLeft", () => this.step(-1));
    key([], "ArrowRight", () => this.step(1));
    key(["Mod"], "z", () => void this.revert());
  }

  getViewType() { return KB_INBOX_VIEW; }
  getDisplayText() { return tr("收件箱消化"); }
  getIcon() { return "lucide-inbox"; }

  private folderPaths(): string[] {
    return this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder).map(folder => folder.path);
  }

  draw(root: HTMLElement) {
    root.addClass("ig-kb-inbox");
    const notes = this.index.all();
    this.queue = inboxQueue(notes, Date.now());
    const actions = kbHeader(root, tr("收件箱消化"));
    kbViewShortcuts(this.plugin, actions, KB_INBOX_VIEW);
    const undo = kbIconButton(actions, "lucide-undo-2", tr("撤销"), () => void this.revert());
    undo.disabled = !this.undo.length;

    if (!this.queue.length) { this.current = ""; kbEmpty(root, tr("收件箱已清空")); return; }
    let at = this.queue.findIndex(note => note.path === this.current);
    if (at < 0) at = 0;
    const note = this.queue[at];
    this.current = note.path;

    const folders = this.folderPaths();
    const { knowledge, work, personal } = this.folders;
    this.topics = buildTopics(folders, notes, knowledge);
    const backlinks = notes.filter(other => other.links.includes(note.path)).map(other => other.path);
    this.suggestions = suggestTopics({ title: note.title, tags: note.tags, links: note.links, backlinks }, this.topics).map(s => s.topic);

    const nav = root.createDiv({ cls: "ig-kb-pager" });
    kbIconButton(nav, "lucide-chevron-left", tr("上一篇"), () => this.step(-1)).disabled = at === 0;
    nav.createSpan({ cls: "ig-kb-count", text: `${at + 1} / ${this.queue.length}` });
    kbIconButton(nav, "lucide-chevron-right", tr("下一篇"), () => this.step(1)).disabled = at === this.queue.length - 1;

    const card = root.createDiv({ cls: "ig-kb-clip" });
    const title = card.createEl("button", { cls: "ig-kb-clip-title", text: note.title, attr: { type: "button" } });
    title.addEventListener("click", () => openNote(this.plugin, note.path));
    const meta = card.createDiv({ cls: "ig-kb-clip-meta" });
    meta.createSpan({ text: formatDay(note.ctime) });
    const source = clipSource(note.frontmatter);
    if (source) {
      const link = meta.createEl("a", { cls: "ig-kb-clip-source", text: hostOf(source), href: source });
      link.setAttr("target", "_blank");
    }
    const summary = card.createDiv({ cls: "ig-kb-clip-summary" });
    if (this.summaryFor === note.path) summary.setText(this.summary);
    else void this.loadSummary(note, summary);

    this.conclusion = card.createEl("input", { cls: "ig-kb-clip-input", attr: { type: "text", placeholder: tr("一句结论"), spellcheck: "false" } });

    const topics = card.createDiv({ cls: "ig-kb-clip-topics" });
    this.suggestions.forEach((topic, i) => this.actionButton(topics, String(i + 1), topic.name, () => void this.file(topic), "mod-cta"));
    const others = this.topics.filter(topic => !this.suggestions.includes(topic));
    if (others.length) this.picker(topics, tr("归入主题"), others, topic => void this.file(topic));

    const row = card.createDiv({ cls: "ig-kb-clip-actions" });
    const projects = [...buildTopics(folders, notes, work), ...buildTopics(folders, notes, personal)].filter(project => project.page);
    if (projects.length) this.picker(row, tr("关联项目"), projects, project => void this.link(project));
    this.actionButton(row, "A", tr("归档"), () => void this.archive());
    this.actionButton(row, "S", tr("稍后"), () => void this.snooze());
  }

  private actionButton(parent: HTMLElement, key: string, label: string, run: () => void, cls = "") {
    const button = parent.createEl("button", { cls: `ig-kb-action ${cls}`.trim(), attr: { type: "button" } });
    button.createSpan({ cls: "ig-kb-key", text: key });
    button.createSpan({ text: label });
    button.addEventListener("click", run);
    return button;
  }

  private picker(parent: HTMLElement, label: string, items: TopicProfile[], run: (item: TopicProfile) => void) {
    const select = parent.createEl("select", { cls: "dropdown ig-kb-picker" });
    select.createEl("option", { text: label, value: "" });
    items.forEach((item, i) => select.createEl("option", { text: item.name, value: String(i) }));
    select.addEventListener("change", () => { const item = items[Number(select.value)]; if (select.value !== "" && item) run(item); });
  }

  private async loadSummary(note: KbNote, el: HTMLElement) {
    const file = this.app.vault.getAbstractFileByPath(note.path);
    if (!(file instanceof TFile)) return;
    const text = clipSummary(note.frontmatter, await this.app.vault.cachedRead(file));
    this.summaryFor = note.path;
    this.summary = text;
    if (el.isConnected) el.setText(text);
  }

  private step(delta: number) {
    const at = this.queue.findIndex(note => note.path === this.current);
    const next = this.queue[Math.max(0, Math.min(this.queue.length - 1, at + delta))];
    if (next && next.path !== this.current) { this.current = next.path; this.redraw(); this.contentEl.focus(); }
  }

  /** After an action, the card that took the handled one's place. */
  private advance() {
    const at = this.queue.findIndex(note => note.path === this.current);
    this.current = this.queue[at + 1]?.path ?? this.queue[at - 1]?.path ?? "";
  }

  private async run(label: string, action: (steps: Step[]) => Promise<void>) {
    if (this.busy || !this.current) return;
    this.busy = true;
    const steps: Step[] = [];
    const focus = this.current;
    try {
      await action(steps);
      this.undo.push({ label, steps, focus });
      if (this.undo.length > 20) this.undo.shift();
      this.advance();
      new Notice(tr("已{action}：{name}", { action: label, name: focus.slice(focus.lastIndexOf("/") + 1, -3) }));
    } catch (error) {
      await this.rollback(steps);
      new Notice(tr("操作失败：{error}", { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      this.busy = false;
      this.index.flush();
    }
  }

  private async ensureFolder(path: string) {
    if (path && !this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
  }

  private async move(steps: Step[], path: string, folder: string): Promise<TFile> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(path);
    await this.ensureFolder(folder);
    const to = uniquePath(folder, file.basename, p => Boolean(this.app.vault.getAbstractFileByPath(p)));
    await this.app.fileManager.renameFile(file, to);
    steps.push({ kind: "move", from: path, to });
    return file;
  }

  private async appendLink(steps: Step[], pagePath: string | null, folder: string, file: TFile, conclusion: string) {
    const { vault } = this.app;
    const found = pagePath ? vault.getAbstractFileByPath(pagePath) : null;
    let target: TFile;
    if (found instanceof TFile) target = found;
    else {
      const name = folder.slice(folder.lastIndexOf("/") + 1);
      target = await vault.create(uniquePath(folder, name, p => Boolean(vault.getAbstractFileByPath(p))), `# ${name}\n`);
      steps.push({ kind: "create", path: target.path });
    }
    const before = await vault.read(target);
    const link = this.app.fileManager.generateMarkdownLink(file, target.path);
    await vault.modify(target, appendUnderHeading(before, KB_CLIP_HEADING, clipLine(link, conclusion)));
    if (!steps.some(step => step.kind === "create" && step.path === target.path)) steps.push({ kind: "write", path: target.path, before });
  }

  private file(topic: TopicProfile) {
    const conclusion = this.conclusion?.value ?? "";
    return this.run(tr("归入「{name}」", { name: topic.name }), async steps => {
      const file = await this.move(steps, this.current, topic.path);
      await this.appendLink(steps, topic.page, topic.path, file, conclusion);
    });
  }

  private link(project: TopicProfile) {
    const conclusion = this.conclusion?.value ?? "";
    return this.run(tr("关联「{name}」", { name: project.name }), async steps => {
      const file = this.app.vault.getAbstractFileByPath(this.current);
      if (!(file instanceof TFile)) throw new Error(this.current);
      await this.appendLink(steps, project.page, project.path, file, conclusion);
    });
  }

  private archive() {
    return this.run(tr("归档"), async steps => { await this.move(steps, this.current, `${this.folders.archive}/${KB_ARCHIVE_SUBFOLDER}`); });
  }

  private snooze() {
    return this.run(tr("稍后"), async steps => {
      const file = this.app.vault.getAbstractFileByPath(this.current);
      if (!(file instanceof TFile)) throw new Error(this.current);
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        steps.push({ kind: "snooze", path: file.path, before: fm[KB_SNOOZE_KEY] });
        fm[KB_SNOOZE_KEY] = formatDay(Date.now());
      });
    });
  }

  private async rollback(steps: Step[]) {
    const { vault, fileManager } = this.app;
    for (const step of [...steps].reverse()) {
      if (step.kind === "move") {
        const file = vault.getAbstractFileByPath(step.to);
        if (file instanceof TFile) await fileManager.renameFile(file, step.from);
      } else if (step.kind === "write") {
        const file = vault.getAbstractFileByPath(step.path);
        if (file instanceof TFile) await vault.modify(file, step.before);
      } else if (step.kind === "create") {
        const file = vault.getAbstractFileByPath(step.path);
        if (file instanceof TFile) await fileManager.trashFile(file);
      } else {
        const file = vault.getAbstractFileByPath(step.path);
        if (file instanceof TFile) await fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          if (step.before === undefined) delete fm[KB_SNOOZE_KEY]; else fm[KB_SNOOZE_KEY] = step.before;
        });
      }
    }
  }

  private async revert() {
    const entry = this.undo.pop();
    if (!entry || this.busy) return;
    this.busy = true;
    try {
      await this.rollback(entry.steps);
      this.current = entry.focus;
      new Notice(tr("已撤销：{action}", { action: entry.label }));
    } finally {
      this.busy = false;
      this.index.flush();
    }
  }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

registerKbFeature({
  key: "inbox", view: KB_INBOX_VIEW, name: zh("开始消化收件箱"), icon: "lucide-inbox",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbInboxView(leaf, plugin)
});
