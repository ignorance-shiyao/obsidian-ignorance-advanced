import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARCHITECTURE_ALIASES, mapArchitectureIcons } from "./architecture-icons";

describe("Mermaid 架构图图标别名", () => {
  it("把常见服务名映射为图标包名称，保留内置图标", () => {
    const source = [
      "architecture-beta",
      "    group clients(cloud)[Clients]",
      "    service web(frontend)[Web] in clients",
      "    service api(backend)[API] in clients",
      "    service data(PostgreSQL)[DB] in clients",
      "    service files(S3)[Files] in clients",
      "    service bus(eventbus)[Events] in clients"
    ].join("\n");
    const mapped = mapArchitectureIcons(source);
    expect(mapped).toContain("group clients(cloud)[Clients]");
    expect(mapped).toContain("service web(ibm-lucide:app-window)");
    expect(mapped).toContain("service api(ibm-lucide:server)");
    expect(mapped).toContain("service data(ibm-lucide:database)");
    expect(mapped).toContain("service files(ibm-lucide:cloud-upload)");
    expect(mapped).toContain("service bus(ibm-lucide:radio)");
  });

  it("不改写其他图表或未知图标", () => {
    expect(mapArchitectureIcons("flowchart LR\nA(frontend)-->B")).toBe("flowchart LR\nA(frontend)-->B");
    expect(mapArchitectureIcons("architecture-beta\nservice x(unknown-thing)[X]")).toContain("service x(unknown-thing)[X]");
  });

  it("所有别名目标都存在于随插件发布的 Lucide 图标包", () => {
    // The standalone repository keeps it in vendor/; the vault checkout next to the plugin.
    const bundled = [new URL("../../vendor/lucide-icons.json", import.meta.url), new URL("../../../../.obsidian/plugins/ignorance-advanced/lucide-icons.json", import.meta.url)]
      .find(url => existsSync(url));
    const raw = JSON.parse(readFileSync(bundled, "utf8"));
    const names = new Set([...Object.keys(raw.icons), ...Object.keys(raw.aliases || {})]);
    expect(Object.entries(ARCHITECTURE_ALIASES).filter(([, icon]) => !names.has(icon))).toEqual([]);
  });
});
