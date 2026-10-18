import { afterEach, expect, it, vi } from "vitest";
import { renderMermaidForExport } from "./mermaid-export";

afterEach(() => vi.unstubAllGlobals());

it("导出渲染失败时移除包含错误图的临时容器并保留原错误", async () => {
  const remove = vi.fn();
  const container = { remove };
  const error = new Error("invalid diagram");
  const render = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("document", { body: { createDiv: () => container } });
  vi.stubGlobal("window", { mermaid: { render } });
  await expect(renderMermaidForExport("export-error", "invalid")).rejects.toBe(error);
  expect(render).toHaveBeenCalledWith("export-error", "invalid", container);
  expect(remove).toHaveBeenCalledOnce();
});

it("导出成功时保留 SVG 结果并清理临时容器", async () => {
  const remove = vi.fn();
  const result = { svg: "<svg></svg>" };
  vi.stubGlobal("document", { body: { createDiv: () => ({ remove }) } });
  vi.stubGlobal("window", { mermaid: { render: vi.fn().mockResolvedValue(result) } });
  await expect(renderMermaidForExport("export-ok", "flowchart LR\nA-->B")).resolves.toBe(result);
  expect(remove).toHaveBeenCalledOnce();
});
