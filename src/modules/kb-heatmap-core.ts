import { DAY, startOfDay } from "./kb-index-core.js";
import type { KbNote } from "./kb-index-core.js";
import { activityDays, parseRange } from "./kb-activity-core.js";
import type { ActivityDay, ActivityMetric } from "./kb-activity-core.js";
import { formatDay } from "./kb-date-core.js";

/* Activity heatmap: the ```ig-heatmap block's settings and the ECharts calendar option. */

export interface HeatmapParams { days: number; folder: string; metric: ActivityMetric }

/** `range: 6m`, `folder: 30-知识`, `metric: created|modified` — one per line, "key: value" or "key=value". */
export function parseHeatmapParams(source: string): HeatmapParams {
  const params: HeatmapParams = { days: 365, folder: "", metric: "both" };
  for (const line of source.split("\n")) {
    const m = /^\s*([a-z]+)\s*[:=]\s*(.*?)\s*$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].replace(/^["']|["']$/g, "");
    if (key === "range") params.days = parseRange(value);
    else if (key === "folder") params.folder = value.replace(/^\/+|\/+$/g, "");
    else if (key === "metric") params.metric = value === "created" || value === "modified" ? value : "both";
  }
  return params;
}

export interface HeatmapData { from: number; to: number; days: ActivityDay[]; max: number; total: number }

export function heatmapData(notes: Iterable<KbNote>, params: HeatmapParams, now: number): HeatmapData {
  const to = startOfDay(now);
  const from = to - (params.days - 1) * DAY;
  const days = [...activityDays(notes, params.metric, from, now, params.folder).values()];
  const counts = days.map(day => day.paths.length);
  return { from, to, days, max: Math.max(0, ...counts), total: counts.reduce((a, b) => a + b, 0) };
}

/** Number of week columns the calendar needs. */
export function weekColumns(from: number, to: number): number {
  const mondayOffset = (new Date(from).getDay() + 6) % 7;
  return Math.ceil((Math.round((to - from) / DAY) + 1 + mondayOffset) / 7);
}

function hexAlpha(color: string, alpha: number): string {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const hex = m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1];
  return `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

export interface HeatmapTokens { primary: string; text: string; muted: string; border: string; background: string }

/**
 * Upper bounds of the four colour levels: quartiles of the non-empty days, so one sync burst
 * (hundreds of files touched at once) does not wash every other day out.
 */
export function levelSteps(counts: readonly number[]): number[] {
  const values = counts.filter(n => n > 0).sort((a, b) => a - b);
  if (!values.length) return [1];
  const at = (f: number) => values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * f) - 1))];
  const steps = [at(0.25), at(0.5), at(0.75), values[values.length - 1]];
  return steps.filter((n, i) => i === 0 || n > steps[i - 1]);
}

/** Calendar + heatmap option and the height it needs at `width`. */
export function heatmapOption(data: HeatmapData, tokens: HeatmapTokens, width: number, labels: { less: string; more: string }, locale: "zh" | "en") {
  const weeks = weekColumns(data.from, data.to);
  const left = 34, right = 12, top = 26;
  const cell = Math.max(8, Math.min(22, Math.floor((width - left - right) / weeks)));
  const height = top + cell * 7 + 44;
  const steps = levelSteps(data.days.map(day => day.paths.length));
  const pieces = [{ min: 0, max: 0, color: hexAlpha(tokens.border, 0.55) }];
  let low = 1;
  steps.forEach((high, i) => { if (high >= low) { pieces.push({ min: low, max: high, color: hexAlpha(tokens.primary, 0.3 + i * 0.23) }); low = high + 1; } });
  return {
    height,
    option: {
      tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0]} · ${p.value[1]}` },
      visualMap: { type: "piecewise", show: true, orient: "horizontal", right: right + 24, bottom: 4, itemWidth: 10, itemHeight: 10, itemGap: 4, showLabel: false,
        text: [labels.more, labels.less], textStyle: { color: tokens.muted, fontSize: 11 }, pieces, selectedMode: false },
      calendar: {
        left, right, top, cellSize: [cell, cell], range: [formatDay(data.from), formatDay(data.to)],
        itemStyle: { color: "transparent", borderWidth: 0 },
        splitLine: { show: false },
        dayLabel: { firstDay: 1, nameMap: locale === "zh" ? "ZH" : "EN", color: tokens.muted, fontSize: 10, margin: 6 },
        monthLabel: { nameMap: locale === "zh" ? "ZH" : "EN", color: tokens.muted, fontSize: 11 },
        yearLabel: { show: false }
      },
      // Rounded squares with a gap, drawn without a border colour, so they sit on any background.
      series: [{ type: "scatter", coordinateSystem: "calendar", symbol: "roundRect", symbolSize: Math.max(5, cell - Math.max(2, Math.round(cell / 6))),
        itemStyle: { borderWidth: 0 }, emphasis: { scale: false }, cursor: "pointer", data: data.days.map(day => [day.day, day.paths.length]) }]
    }
  };
}
