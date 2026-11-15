import type { WorkspaceLeaf } from "obsidian";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, kbEnabled, kbSettings, kbViews, openKbView, openNote, registerKbFeature } from "./kb.js";
import { activityDays } from "./kb-activity-core.js";
import { computeDashboard } from "./kb-home-core.js";
import type { Attention, Dashboard } from "./kb-home-core.js";
import { DAY, dayKey, startOfDay } from "./kb-index-core.js";
import type { KbArea } from "./kb-index-core.js";
import { kbDate, kbEmpty, kbHeader, kbIconButton, kbRow, kbSection, kbTile, renderInBatches } from "./kb-ui.js";

/* P0-1 Knowledge home (ig-kb-home): the vault at a glance and what needs attention today. */

export const KB_HOME_VIEW = "ig-kb-home";
export const KB_INBOX_VIEW = "ig-kb-inbox";

const AREA_LABELS: Record<KbArea, string> = {
  inbox: zh("收件箱"), nav: zh("导航"), work: zh("工作"), personal: zh("个人"), knowledge: zh("知识"), archive: zh("归档"), other: zh("其他")
};

export function kbAreaLabel(area: KbArea): string { return tr(AREA_LABELS[area]); }

export function kbViewShortcuts(plugin: IgnorancePlugin, actions: HTMLElement, current: string) {
  for (const spec of kbViews(plugin)) {
    if (spec.view === current || !spec.view) continue;
    const view = spec.view;
    kbIconButton(actions, spec.icon, tr(spec.name), () => void openKbView(plugin, view));
  }
}

/** Levels 0–4 of a count against the busiest day. */
export function activityLevel(count: number, max: number): number {
  return count <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
}

class KbHomeView extends KbView {
  private detail: { title: string; paths: string[] } | null = null;
  private expanded = new Set<string>();
  private drawn = 0;

  getViewType() { return KB_HOME_VIEW; }
  getDisplayText() { return tr("知识首页"); }
  getIcon() { return "lucide-layout-dashboard"; }

  async draw(root: HTMLElement) {
    root.addClass("ig-kb-home");
    const run = ++this.drawn;
    const dues = await this.index.taskDues();
    if (run !== this.drawn) return;
    const notes = this.index.all();
    const d = computeDashboard(notes, Date.now(), dues, kbSettings(this.plugin).thresholds);
    const actions = kbHeader(root, tr("知识首页"));
    kbViewShortcuts(this.plugin, actions, KB_HOME_VIEW);
    kbIconButton(actions, "lucide-refresh-cw", tr("刷新"), () => { this.index.reset(); this.index.flush(); });

    const show = (title: string, paths: string[]) => () => { this.detail = { title, paths }; this.redraw(); };
    const tiles = root.createDiv({ cls: "ig-kb-tiles" });
    kbTile(tiles, tr("笔记"), d.total, undefined, show(tr("笔记"), [...notes].sort((a, b) => b.mtime - a.mtime).map(n => n.path)));
    kbTile(tiles, tr("本周新增"), d.weekCreated.length, undefined, show(tr("本周新增"), d.weekCreated));
    kbTile(tiles, tr("本周修改"), d.weekModified.length, undefined, show(tr("本周修改"), d.weekModified));
    kbTile(tiles, tr("未消化剪藏"), d.inbox.length, undefined, this.inboxAction(show(tr("未消化剪藏"), d.inbox)));
    kbTile(tiles, tr("积压超过 {n} 天", { n: kbSettings(this.plugin).thresholds.inboxStaleDays }), d.inboxStale.length, d.inboxStale.length ? "warn" : undefined, show(tr("积压剪藏"), d.inboxStale));
    kbTile(tiles, tr("未完成任务"), d.openTaskCount, undefined, show(tr("未完成任务"), d.openTasks));
    kbTile(tiles, tr("今天到期"), d.dueTodayCount, undefined, show(tr("今天到期"), d.dueToday));
    kbTile(tiles, tr("已逾期"), d.overdueCount, d.overdueCount ? "warn" : undefined, show(tr("已逾期"), d.overdue));

    if (this.detail) this.drawDetail(root);

    const attention = kbSection(root, tr("需要关注"), d.attention.length);
    if (!d.attention.length) kbEmpty(attention, tr("一切正常"));
    for (const item of d.attention) this.attentionRow(attention, item);

    this.drawProducts(root, d);
    this.drawActivity(root);

    const areas = kbSection(root, tr("分区"));
    const max = Math.max(1, ...Object.values(d.areas));
    for (const area of Object.keys(d.areas) as KbArea[]) {
      if (!d.areas[area]) continue;
      const row = areas.createEl("button", { cls: "ig-kb-bar-row", attr: { type: "button" } });
      row.createSpan({ cls: "ig-kb-bar-label", text: kbAreaLabel(area) });
      row.createDiv({ cls: "ig-kb-bar" }).createDiv({ cls: "ig-kb-bar-fill" }).style.setProperty("--ig-kb-ratio", String(d.areas[area] / max));
      row.createSpan({ cls: "ig-kb-bar-value", text: String(d.areas[area]) });
      row.addEventListener("click", show(kbAreaLabel(area), notes.filter(n => n.area === area).sort((a, b) => b.mtime - a.mtime).map(n => n.path)));
    }

    const recent = kbSection(root, tr("最近修改"));
    for (const note of d.recent) kbRow(recent, { icon: "lucide-file-text", label: note.title, meta: kbDate(note.mtime), onClick: () => openNote(this.plugin, note.path) });
  }

  private inboxAction(fallback: () => void) {
    return () => { if (kbEnabled(this.plugin, "inbox")) void openKbView(this.plugin, KB_INBOX_VIEW); else fallback(); };
  }

  private drawDetail(root: HTMLElement) {
    const detail = this.detail;
    if (!detail) return;
    const body = kbSection(root, detail.title, detail.paths.length);
    body.parentElement?.addClass("ig-kb-detail");
    const head = body.parentElement?.querySelector<HTMLElement>(".ig-kb-section-head");
    if (head) kbIconButton(head, "lucide-x", tr("关闭"), () => { this.detail = null; this.redraw(); }).addClass("ig-kb-close");
    if (!detail.paths.length) { kbEmpty(body, tr("暂无")); return; }
    renderInBatches(detail.paths, 200, path => {
      const note = this.index.notes.get(path);
      if (note) kbRow(body, { label: note.title, meta: kbDate(note.mtime), onClick: () => openNote(this.plugin, path) });
    }, () => body.isConnected);
  }

  private drawProducts(root: HTMLElement, d: Dashboard) {
    const products = kbSection(root, tr("进行中的项目"), d.products.length);
    if (!d.products.length) { kbEmpty(products, tr("暂无")); return; }
    const grid = products.createDiv({ cls: "ig-kb-cards" });
    for (const line of d.products) {
      const card = grid.createDiv({ cls: "ig-kb-card" });
      if (line.stale) card.addClass("is-warn");
      const head = card.createDiv({ cls: "ig-kb-card-head" });
      head.createSpan({ cls: "ig-kb-card-title", text: line.name });
      head.createSpan({ cls: "ig-kb-row-meta", text: line.idleDays ? tr("{n} 天", { n: line.idleDays }) : tr("今天") });
      for (const note of line.recent) kbRow(card, { label: note.title, meta: kbDate(note.mtime), onClick: () => openNote(this.plugin, note.path) });
    }
  }

  private drawActivity(root: HTMLElement) {
    const body = kbSection(root, tr("活跃度"));
    const now = Date.now();
    const weeks = 12;
    const end = startOfDay(now);
    // Start on the Monday 11 weeks before this week's Monday.
    const start = end - ((new Date(end).getDay() + 6) % 7) * DAY - (weeks - 1) * 7 * DAY;
    const days = activityDays(this.index.all(), "modified", start, now);
    const max = Math.max(0, ...[...days.values()].map(day => day.paths.length));
    const grid = body.createDiv({ cls: "ig-kb-spark", attr: { role: "img", "aria-label": tr("活跃度") } });
    for (const day of days.values()) {
      const cell = grid.createEl("button", { cls: "ig-kb-spark-cell", attr: { type: "button", "aria-label": `${day.day} · ${day.paths.length}` } });
      cell.dataset.level = String(activityLevel(day.paths.length, max));
      if (day.day === dayKey(now)) cell.addClass("is-today");
      cell.addEventListener("click", () => { this.detail = { title: day.day, paths: day.paths }; this.redraw(); });
    }
  }

  private attentionRow(parent: HTMLElement, item: Attention) {
    const key = item.kind + (item.topic ?? "");
    const t = kbSettings(this.plugin).thresholds;
    const label = item.kind === "inbox" ? tr("积压超过 {n} 天", { n: t.inboxStaleDays })
      : item.kind === "overdue" ? tr("已逾期")
      : tr("{name} 未更新", { name: item.topic?.slice(item.topic.lastIndexOf("/") + 1) ?? "" });
    const meta = item.kind === "stale" ? tr("{n} 天", { n: item.count }) : String(item.count);
    const icon = item.kind === "inbox" ? "lucide-inbox" : item.kind === "overdue" ? "lucide-alarm-clock" : "lucide-hourglass";
    const toggle = () => { if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key); this.redraw(); };
    kbRow(parent, { icon, label, meta, tone: "warn", onClick: item.kind === "inbox" ? this.inboxAction(toggle) : toggle });
    if (!this.expanded.has(key)) return;
    const list = parent.createDiv({ cls: "ig-kb-sublist" });
    for (const path of item.paths.slice(0, 50)) {
      const note = this.index.notes.get(path);
      if (note) kbRow(list, { label: note.title, onClick: () => openNote(this.plugin, path) });
    }
  }
}

registerKbFeature({
  key: "home", view: KB_HOME_VIEW, name: zh("打开知识首页"), icon: "lucide-layout-dashboard",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbHomeView(leaf, plugin),
  install: plugin => {
    plugin.app.workspace.onLayoutReady(() => {
      if (kbEnabled(plugin, "home") && kbSettings(plugin).openHomeOnStartup) void openKbView(plugin, KB_HOME_VIEW);
    });
  }
});
