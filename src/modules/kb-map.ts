import { TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { EChartsType } from "echarts";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbView, openNote, registerKbFeature } from "./kb.js";
import { mountKbChart } from "./kb-chart.js";
import type { KbChartHandle } from "./kb-chart.js";
import { kbViewShortcuts, kbAreaLabel } from "./kb-home.js";
import { topicPage } from "./kb-inbox-core.js";
import { buildMapGraph, filterGraph, searchNodes, topicDigest } from "./kb-map-core.js";
import type { MapArea, MapGraph, MapNode } from "./kb-map-core.js";
import { kbEmpty, kbHeader, kbIconButton, kbRow, kbSection } from "./kb-ui.js";

/* P1-1 Knowledge map (ig-kb-map): topics, their notes and the projects they reach, as an ECharts force graph. */

export const KB_MAP_VIEW = "ig-kb-map";
/** Above this many nodes the graph is filled in slices, one per frame. */
export const KB_MAP_BATCH = 1000;

const AREAS: MapArea[] = ["knowledge", "work", "personal"];
const AREA_VARS: Record<MapArea, string> = { knowledge: "--color-blue", work: "--color-orange", personal: "--color-green" };

/** Soft halo colour: the area colour at 40% when it is a 6-digit hex, else a neutral glow. */
function halo(color: string): string { return /^#[\da-f]{6}$/i.test(color) ? `${color}66` : "rgba(120, 130, 160, 0.3)"; }

class KbMapView extends KbView {
  private areas = new Set<MapArea>(AREAS);
  private query = "";
  private selected: string | null = null;
  private graph: MapGraph = { nodes: [], edges: [] };
  private chart: KbChartHandle | null = null;
  private shown = 0;
  private version = -1;
  private batch = 0;
  private panel: HTMLElement | null = null;

  getViewType() { return KB_MAP_VIEW; }
  getDisplayText() { return tr("知识地图"); }
  getIcon() { return "lucide-network"; }

  redraw() {
    if (this.chart && this.contentEl.querySelector(".ig-kb-map-chart")) { this.refreshGraph(); return; }
    super.redraw();
  }

  private refreshGraph() {
    if (this.version === this.index.version) return;
    this.version = this.index.version;
    this.graph = filterGraph(buildMapGraph(this.index.all(), this.folders), this.areas);
    this.shown = Math.min(this.graph.nodes.length, KB_MAP_BATCH);
    this.chart?.update();
    this.fillInBatches();
  }

  private fillInBatches() {
    window.cancelAnimationFrame(this.batch);
    if (this.shown >= this.graph.nodes.length) return;
    this.batch = window.requestAnimationFrame(() => {
      this.shown = Math.min(this.graph.nodes.length, this.shown + KB_MAP_BATCH);
      this.chart?.update();
      this.fillInBatches();
    });
  }

  draw(root: HTMLElement) {
    root.addClass("ig-kb-map");
    this.chart?.dispose();
    const actions = kbHeader(root, tr("知识地图"));
    kbViewShortcuts(this.plugin, actions, KB_MAP_VIEW);

    const bar = root.createDiv({ cls: "ig-kb-toolbar" });
    const search = bar.createEl("input", { cls: "ig-kb-search", attr: { type: "search", placeholder: tr("搜索"), spellcheck: "false" } });
    search.value = this.query;
    search.addEventListener("input", () => { this.query = search.value; this.highlight(); });
    const chips = bar.createDiv({ cls: "ig-kb-segments" });
    for (const area of AREAS) {
      const chip = chips.createEl("button", { cls: "ig-kb-segment", attr: { type: "button" } });
      chip.createSpan({ cls: "ig-kb-dot" }).style.setProperty("--ig-kb-dot", `var(${AREA_VARS[area]})`);
      chip.createSpan({ text: kbAreaLabel(area) });
      chip.toggleClass("is-active", this.areas.has(area));
      chip.addEventListener("click", () => {
        if (this.areas.has(area)) { if (this.areas.size > 1) this.areas.delete(area); } else this.areas.add(area);
        chip.toggleClass("is-active", this.areas.has(area));
        this.version = -1; this.refreshGraph();
      });
    }

    const body = root.createDiv({ cls: "ig-kb-map-body" });
    const host = body.createDiv({ cls: "ig-kb-chart ig-kb-map-chart ig-kb-section" });
    this.panel = body.createDiv({ cls: "ig-kb-map-panel" });
    this.version = this.index.version;
    this.graph = filterGraph(buildMapGraph(this.index.all(), this.folders), this.areas);
    this.shown = Math.min(this.graph.nodes.length, KB_MAP_BATCH);
    if (!this.graph.nodes.length) { host.remove(); kbEmpty(body, tr("知识目录里还没有笔记")); return; }
    this.chart = mountKbChart(host, (tokens, width) => ({ option: this.option(tokens.text, tokens.muted, tokens.background), height: Math.max(420, Math.min(760, Math.round(width * 0.62))) }),
      chart => this.bind(chart), true);
    this.fillInBatches();
    this.drawPanel();
  }

  private option(text: string, muted: string, background: string): Record<string, unknown> {
    const style = getComputedStyle(document.body);
    const colors = AREAS.map(area => style.getPropertyValue(AREA_VARS[area]).trim() || "#4D81EF");
    const nodes = this.graph.nodes.slice(0, this.shown);
    const ids = new Set(nodes.map(node => node.id));
    const size = (node: MapNode) => node.kind === "topic" ? 26 + Math.sqrt(node.size) * 6 : node.kind === "project" ? 14 + Math.min(16, Math.sqrt(node.size) * 4) : 8;
    return {
      tooltip: { formatter: (p: { dataType: string; data: { name?: string } }) => p.dataType === "node" ? p.data.name ?? "" : "" },
      series: [{
        type: "graph", layout: "force", roam: true, draggable: true,
        categories: AREAS.map((area, i) => ({ name: kbAreaLabel(area), itemStyle: { color: colors[i] } })),
        force: { repulsion: nodes.length > 300 ? 60 : 140, edgeLength: [24, 90], gravity: 0.08, friction: 0.2 },
        emphasis: { focus: "adjacency", label: { show: true }, lineStyle: { width: 2 } },
        blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.05 }, label: { show: false } },
        label: { color: text, fontSize: 12, position: "right" },
        lineStyle: { color: "source", curveness: 0.16 },
        data: nodes.map(node => ({
          id: node.id, name: node.name, value: node.size, category: AREAS.indexOf(node.area),
          symbol: node.kind === "project" ? "roundRect" : "circle", symbolSize: size(node),
          label: { show: node.kind !== "note" || nodes.length < 60, fontWeight: node.kind === "topic" ? 600 : 400 },
          itemStyle: { borderColor: background, borderWidth: node.kind === "note" ? 1 : 2, shadowBlur: node.kind === "topic" ? 22 : node.kind === "project" ? 12 : 4, shadowColor: halo(colors[Math.max(0, AREAS.indexOf(node.area))]) }
        })),
        links: this.graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({
          source: edge.source, target: edge.target,
          lineStyle: edge.kind === "member" ? { opacity: 0.22, width: 1 } : { opacity: 0.6, width: 1.6 }
        }))
      }]
    };
  }

  private bind(chart: EChartsType) {
    const nodeOf = (params: { dataType?: string; data?: unknown }) => params.dataType === "node" ? this.graph.nodes.find(node => node.id === (params.data as { id: string }).id) : undefined;
    chart.on("click", params => {
      const node = nodeOf(params);
      if (node?.kind === "topic" || node?.kind === "project") { this.selected = node.id; this.drawPanel(); }
    });
    chart.on("dblclick", params => {
      const node = nodeOf(params);
      if (!node) return;
      const path = node.path ?? this.pageOf(node.id);
      if (path) openNote(this.plugin, path);
    });
    window.setTimeout(() => this.highlight(), 0);
  }

  private pageOf(folder: string): string | null {
    return topicPage(folder, this.index.all().filter(note => note.path.startsWith(folder + "/")).map(note => note.path));
  }

  private highlight() {
    const chart = this.chart?.chart;
    if (!chart) return;
    chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const ids = new Set(searchNodes(this.graph, this.query));
    if (!ids.size) return;
    const dataIndex = this.graph.nodes.slice(0, this.shown).flatMap((node, i) => ids.has(node.id) ? [i] : []);
    chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex });
  }

  private drawPanel() {
    const panel = this.panel;
    if (!panel) return;
    panel.empty();
    const node = this.graph.nodes.find(item => item.id === this.selected);
    panel.toggleClass("is-open", Boolean(node));
    if (!node) return;
    const notes = this.index.all().filter(note => note.path.startsWith(node.id + "/")).sort((a, b) => b.mtime - a.mtime);
    const body = kbSection(panel, node.name, notes.length);
    const head = body.parentElement?.querySelector<HTMLElement>(".ig-kb-section-head");
    if (head) kbIconButton(head, "lucide-x", tr("关闭"), () => { this.selected = null; this.drawPanel(); }).addClass("ig-kb-close");
    const digest = body.createDiv({ cls: "ig-kb-digest" });
    const page = this.pageOf(node.id);
    const file = page ? this.app.vault.getAbstractFileByPath(page) : null;
    if (file instanceof TFile) void this.app.vault.cachedRead(file).then(text => { digest.setText(topicDigest(text)); if (!digest.textContent) digest.remove(); });
    else digest.remove();
    for (const note of notes.slice(0, 200)) kbRow(body, { icon: "lucide-file-text", label: note.title, onClick: () => openNote(this.plugin, note.path) });
  }

  async onClose() {
    window.cancelAnimationFrame(this.batch);
    this.chart?.dispose();
    this.chart = null;
    await super.onClose();
  }
}

registerKbFeature({
  key: "map", view: KB_MAP_VIEW, name: zh("打开知识地图"), icon: "lucide-network",
  create: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => new KbMapView(leaf, plugin)
});
