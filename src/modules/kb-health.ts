import { Modal, Notice, TFile, setIcon } from "obsidian";
import type { App, WorkspaceLeaf } from "obsidian";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, kbSettings, openNote, registerKbFeature } from "./kb.js";
import { HEALTH_CHECKS, groupFindings, ignoreKey, remoteImages, runChecks } from "./kb-health-core.js";
import type { Finding, HealthCheck } from "./kb-health-core.js";
import { kbViewShortcuts } from "./kb-home.js";
import { kbEmpty, kbHeader, kbRow, kbSection, renderInBatches } from "./kb-ui.js";

/* P2 Note health (ig-kb-health): upkeep checks grouped by kind, each finding opens its note. */

export const KB_HEALTH_VIEW = "ig-kb-health";

const LABELS: Record<HealthCheck, string> = {
  broken: zh("断链"), noSource: zh("缺来源"), empty: zh("空笔记"), stale: zh("久未消化"), orphan: zh("孤立笔记"), remoteImage: zh("外链图片")
};
const ICONS: Record<HealthCheck, string> = {
  broken: "lucide-unlink", noSource: "lucide-link-2-off", empty: "lucide-file", stale: "lucide-hourglass", orphan: "lucide-circle-dashed", remoteImage: "lucide-image"
};

/** Confirmation before moving several notes to the system trash. */
class ConfirmTrashModal extends Modal {
  constructor(app: App, private count: number, private run: () => void) { super(app); }
  onOpen() {
    this.titleEl.setText(tr("删除空笔记"));
    this.contentEl.addClass("ig-kb", "ig-kb-modal");
    this.contentEl.createDiv({ text: tr("将 {n} 篇空笔记移到废纸篓。", { n: this.count }) });
    const actions = this.contentEl.createDiv({ cls: "ig-kb-clip-actions" });
    actions.createEl("button", { cls: "ig-kb-action", text: tr("取消"), attr: { type: "button" } }).addEventListener("click", () => this.close());
    actions.createEl("button", { cls: "ig-kb-action mod-warning", text: tr("删除 {n} 篇", { n: this.count }), attr: { type: "button" } }).addEventListener("click", () => { this.close(); this.run(); });
  }
  onClose() { this.contentEl.empty(); }
}

class KbHealthView extends KbView {
  /** Remote images per note, cached by modification time (reading text only happens here). */
  private remote = new Map<string, { mtime: number; images: string[] }>();
  private scanning = false;
  private expandedChecks = new Set<HealthCheck>();

  getViewType() { return KB_HEALTH_VIEW; }
  getDisplayText() { return tr("笔记体检"); }
  getIcon() { return "lucide-stethoscope"; }

  private async scanImages(): Promise<boolean> {
    let changed = false;
    for (const note of this.index.notes.values()) {
      if (note.area === "archive" || this.remote.get(note.path)?.mtime === note.mtime) continue;
      const file = this.app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) continue;
      this.remote.set(note.path, { mtime: note.mtime, images: remoteImages(await this.app.vault.cachedRead(file)) });
      changed = true;
    }
    for (const path of this.remote.keys()) if (!this.index.notes.has(path)) { this.remote.delete(path); changed = true; }
    return changed;
  }

  draw(root: HTMLElement) {
    root.addClass("ig-kb-health");
    const settings = kbSettings(this.plugin);
    const actions = kbHeader(root, tr("笔记体检"));
    kbViewShortcuts(this.plugin, actions, KB_HEALTH_VIEW);
    const remote = new Map([...this.remote].map(([path, entry]) => [path, entry.images]));
    const findings = runChecks(this.index.all(), Date.now(), settings.thresholds.inboxStaleDays, remote);
    const groups = groupFindings(findings, new Set(settings.ignored));

    const tiles = root.createDiv({ cls: "ig-kb-tiles" });
    for (const check of HEALTH_CHECKS) {
      const n = groups[check].open.length;
      const tile = tiles.createEl("button", { cls: "ig-kb-tile", attr: { type: "button" } });
      if (n) tile.addClass("is-warn");
      setIcon(tile.createSpan({ cls: "ig-kb-tile-icon" }), ICONS[check]);
      tile.createDiv({ cls: "ig-kb-tile-value", text: check === "remoteImage" && this.scanning && !this.remote.size ? "…" : String(n) });
      tile.createDiv({ cls: "ig-kb-tile-label", text: tr(LABELS[check]) });
      tile.addEventListener("click", () => {
        this.expandedChecks.add(check);
        this.redraw();
        window.setTimeout(() => this.contentEl.querySelector(`[data-check="${check}"]`)?.scrollIntoView({ block: "start" }), 0);
      });
    }

    for (const check of HEALTH_CHECKS) {
      const { open, ignored } = groups[check];
      const body = kbSection(root, tr(LABELS[check]), open.length);
      const section = body.parentElement;
      section?.setAttr("data-check", check);
      const head = section?.querySelector<HTMLElement>(".ig-kb-section-head");
      if (head) {
        const tools = head.createDiv({ cls: "ig-kb-section-tools" });
        if (check === "empty" && open.length) this.groupButton(tools, tr("全部删除"), () => new ConfirmTrashModal(this.app, open.length, () => void this.trashEmpty(open.map(f => f.path))).open());
        if (open.length) this.groupButton(tools, tr("忽略"), () => this.setIgnored(open, true));
        if (ignored.length) this.groupButton(tools, tr("恢复 {n}", { n: ignored.length }), () => this.setIgnored(ignored, false));
      }
      if (!open.length) { kbEmpty(body, tr("没有问题")); continue; }
      const expanded = this.expandedChecks.has(check) || open.length <= 8;
      const list = expanded ? open : open.slice(0, 8);
      renderInBatches(list, 200, finding => this.row(body, finding), () => body.isConnected);
      if (!expanded) {
        const more = body.createEl("button", { cls: "ig-kb-more", text: tr("全部 {n}", { n: open.length }), attr: { type: "button" } });
        more.addEventListener("click", () => { this.expandedChecks.add(check); this.redraw(); });
      }
    }

    if (!this.scanning) {
      this.scanning = true;
      void this.scanImages().then(changed => { this.scanning = false; if (changed) this.redraw(); });
    }
  }

  private row(parent: HTMLElement, finding: Finding) {
    const note = this.index.notes.get(finding.path);
    const meta = finding.check === "stale" ? tr("{n} 天", { n: finding.detail[0] })
      : finding.detail.length ? finding.detail.slice(0, 2).join("、") + (finding.detail.length > 2 ? ` +${finding.detail.length - 2}` : "") : undefined;
    const row = kbRow(parent, { icon: ICONS[finding.check], label: note?.title ?? finding.path, meta, onClick: () => openNote(this.plugin, finding.path) });
    if (finding.check !== "empty") return;
    const del = row.createSpan({ cls: "ig-kb-row-action", attr: { role: "button", tabindex: "0", "aria-label": tr("删除") } });
    setIcon(del, "lucide-trash-2");
    const run = (event: Event) => { event.stopPropagation(); event.preventDefault(); void this.trashEmpty([finding.path]); };
    del.addEventListener("click", run);
    del.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") run(event); });
  }

  /** Moves notes to the system trash after re-reading each one: only a note with nothing but frontmatter goes. */
  private async trashEmpty(paths: string[]) {
    let done = 0;
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const body = (await this.app.vault.cachedRead(file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      if (body.trim() !== "") continue;
      await this.app.fileManager.trashFile(file);
      done++;
    }
    new Notice(tr("已删除 {n} 篇空笔记", { n: done }));
    this.index.reset();
    this.index.flush();
  }

  private groupButton(parent: HTMLElement, label: string, run: () => void) {
    const button = parent.createEl("button", { cls: "ig-kb-chip", text: label, attr: { type: "button" } });
    button.addEventListener("click", run);
  }

  private setIgnored(findings: Finding[], ignore: boolean) {
    const settings = kbSettings(this.plugin);
    const keys = new Set(findings.map(f => ignoreKey(f.check, f.path)));
    settings.ignored = ignore ? [...new Set([...settings.ignored, ...keys])] : settings.ignored.filter(key => !keys.has(key));
    this.plugin.saveStoredState();
    this.redraw();
  }
}

registerKbFeature({
  key: "health", view: KB_HEALTH_VIEW, name: zh("打开笔记体检"), icon: "lucide-stethoscope",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbHealthView(leaf, plugin)
});
