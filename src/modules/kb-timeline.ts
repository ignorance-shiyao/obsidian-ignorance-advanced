import type { WorkspaceLeaf } from "obsidian";
import type { EChartsType } from "echarts";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, openNote, registerKbFeature } from "./kb.js";
import { mountKbChart } from "./kb-chart.js";
import type { KbChartHandle } from "./kb-chart.js";
import { formatDay } from "./kb-date-core.js";
import { kbViewShortcuts } from "./kb-home.js";
import { buildTimeline, filterTimeline } from "./kb-timeline-core.js";
import type { Timeline, TimelineItem } from "./kb-timeline-core.js";
import { kbEmpty, kbHeader, kbIconButton, kbRow, kbSection, renderInBatches } from "./kb-ui.js";

/* P1-2 Project timeline (ig-kb-timeline): dated work notes on one lane per product line, coloured by kind. */

export const KB_TIMELINE_VIEW = "ig-kb-timeline";

class KbTimelineView extends KbView {
  private lane = "";
  private year: number | null = null;
  private showUndated = false;
  private chart: KbChartHandle | null = null;
  private data: Timeline = { items: [], undated: [], lanes: [], kinds: [], years: [] };
  private shown: TimelineItem[] = [];

  getViewType() { return KB_TIMELINE_VIEW; }
  getDisplayText() { return tr("项目时间线"); }
  getIcon() { return "lucide-gantt-chart"; }

  draw(root: HTMLElement) {
    root.addClass("ig-kb-timeline");
    this.chart?.dispose();
    this.chart = null;
    this.data = buildTimeline(this.index.all(), this.folders.work);
    const actions = kbHeader(root, tr("项目时间线"));
    kbViewShortcuts(this.plugin, actions, KB_TIMELINE_VIEW);

    const bar = root.createDiv({ cls: "ig-kb-toolbar" });
    const lane = bar.createEl("select", { cls: "dropdown" });
    lane.createEl("option", { text: tr("全部产品线"), value: "" });
    for (const name of this.data.lanes) lane.createEl("option", { text: name, value: name });
    lane.value = this.data.lanes.includes(this.lane) ? this.lane : "";
    lane.addEventListener("change", () => { this.lane = lane.value; this.redraw(); });
    const year = bar.createEl("select", { cls: "dropdown" });
    year.createEl("option", { text: tr("全部年份"), value: "" });
    for (const y of this.data.years) year.createEl("option", { text: String(y), value: String(y) });
    year.value = this.year !== null && this.data.years.includes(this.year) ? String(this.year) : "";
    year.addEventListener("change", () => { this.year = year.value ? Number(year.value) : null; this.redraw(); });
    if (this.data.undated.length) {
      const undated = bar.createEl("button", { cls: "ig-kb-chip", text: tr("无日期 {n}", { n: this.data.undated.length }), attr: { type: "button" } });
      undated.toggleClass("is-active", this.showUndated);
      undated.addEventListener("click", () => { this.showUndated = !this.showUndated; this.redraw(); });
    }

    if (this.showUndated) {
      const body = kbSection(root, tr("无日期"), this.data.undated.length);
      const head = body.parentElement?.querySelector<HTMLElement>(".ig-kb-section-head");
      if (head) kbIconButton(head, "lucide-x", tr("关闭"), () => { this.showUndated = false; this.redraw(); }).addClass("ig-kb-close");
      body.parentElement?.addClass("ig-kb-detail");
      renderInBatches(this.data.undated, 200, path => {
        const note = this.index.notes.get(path);
        if (note) kbRow(body, { label: note.title, meta: path.split("/")[1] ?? "", onClick: () => openNote(this.plugin, path) });
      }, () => body.isConnected);
    }

    this.shown = filterTimeline(this.data.items, lane.value, this.year);
    if (!this.shown.length) { kbEmpty(root, tr("没有带日期的笔记")); return; }
    const lanes = lane.value ? [lane.value] : [...new Set(this.shown.map(item => item.lane))].sort((a, b) => a.localeCompare(b));
    const host = root.createDiv({ cls: "ig-kb-chart ig-kb-section ig-kb-timeline-chart" });
    this.chart = mountKbChart(host, tokens => {
      const kinds = [...new Set(this.shown.map(item => item.kind))].sort((a, b) => a.localeCompare(b));
      return {
        height: Math.max(260, lanes.length * 56 + 120),
        option: {
          color: tokens.colors,
          legend: { top: 0, type: "scroll", icon: "roundRect", itemWidth: 24, itemHeight: 10, itemGap: 22, data: kinds.map(kind => kind || tr("其他")) },
          tooltip: { trigger: "item", formatter: (p: { data: { title: string; value: [number, string] } }) => `${p.data.title}<br>${formatDay(p.data.value[0])}` },
          grid: { left: 8, right: 24, top: 40, bottom: 56, containLabel: true },
          xAxis: { type: "time", splitLine: { show: true, lineStyle: { type: "dashed", opacity: 0.5 } }, axisLine: { show: false } },
          yAxis: { type: "category", data: lanes, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: true, lineStyle: { type: "dashed", opacity: 0.5 } }, jitter: 30, jitterOverlap: false },
          dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }, { type: "slider", xAxisIndex: 0, height: 18, bottom: 12, filterMode: "none", borderColor: "transparent", showDataShadow: false, moveHandleSize: 6 }],
          series: kinds.map(kind => ({
            name: kind || tr("其他"), type: "scatter", symbolSize: 14, cursor: "pointer", itemStyle: { opacity: 0.92, borderColor: "#fff", borderWidth: 2, shadowBlur: 6, shadowColor: "rgba(0, 0, 0, 0.12)" }, emphasis: { scale: 1.3 },
            data: this.shown.filter(item => item.kind === kind).map(item => ({ value: [item.time, item.lane], title: item.title, path: item.path }))
          }))
        }
      };
    }, (chart: EChartsType) => {
      chart.on("click", params => {
        const path = (params.data as { path?: string } | undefined)?.path;
        if (path) openNote(this.plugin, path);
      });
    }, true);
  }

  async onClose() {
    this.chart?.dispose();
    this.chart = null;
    await super.onClose();
  }
}

registerKbFeature({
  key: "timeline", view: KB_TIMELINE_VIEW, name: zh("打开项目时间线"), icon: "lucide-gantt-chart",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbTimelineView(leaf, plugin)
});
