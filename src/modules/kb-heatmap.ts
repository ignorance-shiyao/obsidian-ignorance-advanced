import { MarkdownRenderChild, Modal } from "obsidian";
import type { App, WorkspaceLeaf } from "obsidian";
import { activeLanguage, tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, kbEnabled, kbIndex, openNote, registerKbFeature } from "./kb.js";
import type { ActivityMetric } from "./kb-activity-core.js";
import { mountKbChart } from "./kb-chart.js";
import type { KbChartHandle } from "./kb-chart.js";
import { heatmapData, heatmapOption, parseHeatmapParams } from "./kb-heatmap-core.js";
import type { HeatmapParams } from "./kb-heatmap-core.js";
import type { KbIndex } from "./kb-index.js";
import { kbViewShortcuts } from "./kb-home.js";
import { kbEmpty, kbHeader, kbRow } from "./kb-ui.js";

/* P1-3 Activity heatmap (ig-kb-heatmap) and the ```ig-heatmap block: notes created or edited per day. */

export const KB_HEATMAP_VIEW = "ig-kb-heatmap";

class DayModal extends Modal {
  constructor(app: App, private plugin: IgnorancePlugin, private day: string, private paths: string[]) { super(app); }
  onOpen() {
    this.titleEl.setText(`${this.day} · ${this.paths.length}`);
    this.contentEl.addClass("ig-kb", "ig-kb-modal");
    if (!this.paths.length) { kbEmpty(this.contentEl, tr("这天没有笔记")); return; }
    const index = kbIndex(this.plugin);
    for (const path of this.paths) {
      const note = index.notes.get(path);
      kbRow(this.contentEl, { icon: "lucide-file-text", label: note?.title ?? path, onClick: () => { this.close(); openNote(this.plugin, path); } });
    }
  }
  onClose() { this.contentEl.empty(); }
}

/** Draws a heatmap into `host`; returns the chart handle (update() re-reads the index). */
function mountHeatmap(plugin: IgnorancePlugin, host: HTMLElement, index: KbIndex, params: () => HeatmapParams, view = false): KbChartHandle {
  let data = heatmapData(index.notes.values(), params(), Date.now());
  return mountKbChart(host, (tokens, width) => {
    data = heatmapData(index.notes.values(), params(), Date.now());
    return heatmapOption(data, tokens, width, { less: tr("少"), more: tr("多") }, activeLanguage());
  }, chart => {
    chart.on("click", event => {
      const value = event.value as [string, number] | undefined;
      const day = value && data.days.find(item => item.day === value[0]);
      if (day) new DayModal(plugin.app, plugin, day.day, day.paths).open();
    });
  }, view);
}

const METRICS: { value: ActivityMetric; label: string }[] = [
  { value: "both", label: zh("全部") }, { value: "created", label: zh("新建") }, { value: "modified", label: zh("修改") }
];

class KbHeatmapView extends KbView {
  private metric: ActivityMetric = "both";
  private chart: KbChartHandle | null = null;

  getViewType() { return KB_HEATMAP_VIEW; }
  getDisplayText() { return tr("活跃度热力图"); }
  getIcon() { return "lucide-calendar-days"; }

  redraw() {
    // The chart keeps its canvas; only the numbers change.
    if (this.chart && this.contentEl.querySelector(".ig-kb-chart")) { this.chart.update(); return; }
    super.redraw();
  }

  draw(root: HTMLElement) {
    root.addClass("ig-kb-heatmap");
    this.chart?.dispose();
    const actions = kbHeader(root, tr("活跃度热力图"));
    kbViewShortcuts(this.plugin, actions, KB_HEATMAP_VIEW);
    const tabs = root.createDiv({ cls: "ig-kb-segments" });
    for (const metric of METRICS) {
      const button = tabs.createEl("button", { cls: "ig-kb-segment", text: tr(metric.label), attr: { type: "button" } });
      button.toggleClass("is-active", metric.value === this.metric);
      button.addEventListener("click", () => {
        this.metric = metric.value;
        tabs.querySelectorAll(".ig-kb-segment").forEach(el => el.toggleClass("is-active", el === button));
        this.chart?.update();
      });
    }
    const host = root.createDiv({ cls: "ig-kb-chart ig-kb-section" });
    this.chart = mountHeatmap(this.plugin, host, this.index, () => ({ days: 365, folder: "", metric: this.metric }), true);
  }

  async onClose() {
    this.chart?.dispose();
    this.chart = null;
    await super.onClose();
  }
}

class HeatmapBlock extends MarkdownRenderChild {
  private chart: KbChartHandle | null = null;
  private off: (() => void) | null = null;
  constructor(container: HTMLElement, private plugin: IgnorancePlugin, private params: HeatmapParams) { super(container); }
  onload() {
    const host = this.containerEl.createDiv({ cls: "ig-kb-chart ig-kb-block" });
    const index = kbIndex(this.plugin);
    this.chart = mountHeatmap(this.plugin, host, index, () => this.params);
    this.off = index.subscribe(() => this.chart?.update());
  }
  onunload() { this.off?.(); this.chart?.dispose(); }
}

registerKbFeature({
  key: "heatmap", view: KB_HEATMAP_VIEW, name: zh("打开活跃度热力图"), icon: "lucide-calendar-days",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbHeatmapView(leaf, plugin),
  install: plugin => {
    plugin.registerMarkdownCodeBlockProcessor("ig-heatmap", (source, element, context) => {
      element.addClass("ig-kb", "ig-kb-heatmap-block");
      if (!kbEnabled(plugin, "heatmap")) { kbEmpty(element, tr("热力图未开启")); return; }
      context.addChild(new HeatmapBlock(element, plugin, parseHeatmapParams(source)));
    });
  }
});
