import { describe, expect, it } from "vitest";
import { SNIPPET_TEMPLATES, buildSnippetInsertion, resolveSnippet } from "./snippets";

describe("块与图表起手模板", () => {
  it("每个模板都有唯一命令 ID 和单个可选占位文本", () => {
    const ids = SNIPPET_TEMPLATES.map(template => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of SNIPPET_TEMPLATES) {
      let resolved;
      try {
        resolved = resolveSnippet(template.body);
      } catch (error) {
        throw new Error(template.id + ": " + error.message);
      }
      expect(resolved.text).not.toContain("⟦");
      expect(resolved.text).not.toContain("⟧");
      expect(resolved.selectionTo).toBeGreaterThan(resolved.selectionFrom);
    }
  });

  it("流程图使用流线连接，折线图启用平滑曲线", () => {
    const flowcharts = SNIPPET_TEMPLATES.filter(template => template.id.includes("flowchart"));
    expect(flowcharts).toHaveLength(2);
    for (const template of flowcharts) expect(template.body).toContain("curve: basis");
    const line = SNIPPET_TEMPLATES.find(template => template.id === "echarts-line");
    expect(line?.body).toContain('"smooth": true');
  });

  it("所有 ECharts 起手模板都是可解析的 JSON", () => {
    const fence = String.fromCharCode(96).repeat(3);
    const charts = SNIPPET_TEMPLATES.filter(template => template.body.startsWith(fence + "echarts\n"));
    expect(charts.length).toBeGreaterThanOrEqual(6);
    for (const template of charts) {
      const resolved = resolveSnippet(template.body).text;
      const json = resolved.slice((fence + "echarts\n").length, -("\n" + fence).length);
      expect(() => JSON.parse(json), template.id).not.toThrow();
    }
  });

  it("替换光标处并在相邻正文之间留出块间距，选中首个占位文本", () => {
    const template = SNIPPET_TEMPLATES.find(item => item.id === "kpi");
    if (!template) throw new Error("KPI 模板未注册");
    const insertion = buildSnippetInsertion("上文下文", 2, 2, template.body);
    const resolved = resolveSnippet(template.body);
    expect(insertion).toMatchObject({
      from: 2,
      to: 2,
      selectionFrom: 2 + resolved.selectionFrom,
      selectionTo: 2 + resolved.selectionTo
    });
    expect(insertion.text).toContain(":::kpi");
    expect(insertion.text.startsWith("\n\n")).toBe(true);
    expect(insertion.text.endsWith("\n\n")).toBe(true);
    expect(insertion.text.slice(insertion.selectionFrom, insertion.selectionTo)).toBe("转化率提升");
    expect(resolved.text).toContain("转化率提升");
  });
});
