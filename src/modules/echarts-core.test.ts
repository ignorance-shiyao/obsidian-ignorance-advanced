import { describe, expect, it } from "vitest";
import { buildEChartsTheme, echartsThemeName, normalizeEChartsOption, parseEChartsOption } from "./echarts-core";

const tokens = {
  colors: ["#4D81EF", "#D97706", "#0F8A72"],
  primary: "#356FD8",
  text: "#1F2937",
  muted: "#64748B",
  border: "#E5EAF0",
  background: "#FFFFFF",
  fontFamily: "Inter, sans-serif",
  dark: false
};

describe("ECharts 主题与配置", () => {
  it("为标题、副标题和顶部图例分配独立区域，且不修改源配置", () => {
    const option = { title: { text: "数据集", subtext: "dataset" }, legend: { top: 30 }, grid: { top: 80 } };
    const result = normalizeEChartsOption(option, "canvas");
    expect(result.legend.top).toBe(58);
    expect(result.grid.top).toBe(96);
    expect(option.legend.top).toBe(30);
    expect(option.grid.top).toBe(80);
    const bottom = { ...option, legend: { bottom: 0 } };
    expect(normalizeEChartsOption(bottom, "canvas")).toBe(bottom);
  });
  it("从主题 token 构造配色、文字和坐标轴样式", () => {
    const theme = buildEChartsTheme(tokens);
    expect(theme.color).toEqual(tokens.colors);
    expect(theme.textStyle).toEqual({ color: tokens.text, fontFamily: tokens.fontFamily });
    expect(theme.valueAxis.axisLabel.color).toBe(tokens.muted);
    expect(theme.line.smooth).toBe(true);
    expect(theme.backgroundColor).toBe("transparent");
  });

  it("为颜色或明暗变化生成独立主题名", () => {
    expect(echartsThemeName(tokens)).not.toBe(echartsThemeName({ ...tokens, dark: true }));
    expect(echartsThemeName(tokens)).not.toBe(echartsThemeName({ ...tokens, colors: ["#000000"] }));
  });

  it("只接受 JSON 对象，不执行 JavaScript 表达式", () => {
    expect(parseEChartsOption('{"series":[]}')).toEqual({ series: [] });
    expect(() => parseEChartsOption("{ title: { text: 'unsafe' } }")).toThrow("有效 JSON");
    expect(() => parseEChartsOption('{"series": (globalThis.process.exit())}')).toThrow("有效 JSON");
    expect(() => parseEChartsOption("[]")).toThrow("根节点必须是 JSON 对象");
  });

  it("仅在 SVG 渲染时关闭 lines 动效，并保持原配置不变", () => {
    const option = { series: [{ type: "lines", effect: { show: true, period: 4 } }, { type: "line", data: [1, 2] }] };
    const svg = normalizeEChartsOption(option, "svg");
    expect(svg.series[0].effect).toEqual({ show: false, period: 4 });
    expect(svg.series[1]).toBe(option.series[1]);
    expect(option.series[0].effect.show).toBe(true);
    expect(normalizeEChartsOption(option, "canvas")).toBe(option);
  });
});

it("fills anonymous force graphs with readable defaults while retaining authored layout", () => {
  for (const renderer of ["svg", "canvas"] as const) {
    const authored = { type: "graph", layout: "force", force: {edgeLength: 44, repulsion: 90}, label: {show:false}, data:[{name:"A"}] };
    const original = structuredClone(authored);
    const result: any = normalizeEChartsOption({series:[authored,{type:"graph",layout:"circular"}]},renderer);
    expect(result.series[0].force).toMatchObject(original.force);
    expect(result.series[0].force.initLayout).toBe("circular");
    expect(result.series[0].label.show).toBe(false);
    expect(authored).toEqual(original);
    expect(result.series[1]).toEqual({type:"graph",layout:"circular"});
  }
});
