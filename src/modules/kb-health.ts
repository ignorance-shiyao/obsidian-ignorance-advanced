import { TFile, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
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
    kbRow(parent, { icon: ICONS[finding.check], label: note?.title ?? finding.path, meta, onClick: () => openNote(this.plugin, finding.path) });
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
