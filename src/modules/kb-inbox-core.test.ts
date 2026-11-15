import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { appendUnderHeading, buildTopics, clipLine, clipSource, clipSummary, inboxQueue, isSnoozed, suggestTopics, tokenize, topicPage, uniquePath } from "./kb-inbox-core.js";
import { parseDateValue, validDate } from "./kb-date-core.js";

const folders = normalizeKbSettings(undefined).folders;
const NOW = new Date(2026, 10, 15, 12).getTime();
const note = (path: string, extra: Partial<Parameters<typeof buildNote>[0]> = {}) => buildNote({ path, ctime: 0, mtime: 0, size: 1, ...extra }, folders);

describe("dates", () => {
  it("parses frontmatter dates and rejects impossible ones", () => {
    expect(parseDateValue("2026-11-01")).toBe(new Date(2026, 10, 1).getTime());
    expect(parseDateValue("2026/1/2 10:00")).toBe(new Date(2026, 0, 2).getTime());
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue("soon")).toBeNull();
    expect(validDate(2024, 2, 29)).not.toBeNull();
  });
});

describe("inbox digest", () => {
  it("tokenizes Latin words and Chinese pairs", () => {
    expect(tokenize("AI Agent 评测体系")).toEqual(["ai", "agent", "评测", "测体", "体系"]);
    expect(tokenize("如何 the RAG")).toEqual(["rag"]);
  });
  it("picks the topic page", () => {
    expect(topicPage("30-知识/AI", ["30-知识/AI/b.md", "30-知识/AI/AI.md"])).toBe("30-知识/AI/AI.md");
    expect(topicPage("30-知识/AI", ["30-知识/AI/x/a.md", "30-知识/AI/b.md"])).toBe("30-知识/AI/b.md");
    expect(topicPage("30-知识/AI", [])).toBeNull();
  });
  const notes = [
    note("30-知识/AI 与 Agent/Agent 评测.md", { tags: ["#eval"] }),
    note("30-知识/AI 与 Agent/RAG 入门.md"),
    note("30-知识/设计与内容/排版规范.md", { frontmatter: { tags: ["design"] } }),
    note("30-知识/运维方法/值班手册.md")
  ];
  const topics = buildTopics(["30-知识", "30-知识/AI 与 Agent", "30-知识/设计与内容", "30-知识/运维方法", "30-知识/运维方法/子", "30-知识/空主题"], notes, "30-知识");
  it("builds first-level topics, including empty ones", () => {
    expect(topics.map(t => t.name)).toEqual(["AI 与 Agent", "空主题", "设计与内容", "运维方法"].sort((a, b) => a.localeCompare(b)));
    expect(topics.find(t => t.name === "运维方法")?.page).toBe("30-知识/运维方法/值班手册.md");
  });
  it("suggests topics by keywords and links", () => {
    const byWords = suggestTopics({ title: "2026 Agent Eval 全景图", tags: [], links: [], backlinks: [] }, topics);
    expect(byWords[0].topic.name).toBe("AI 与 Agent");
    const byLinks = suggestTopics({ title: "随手记", tags: [], links: ["30-知识/运维方法/值班手册.md"], backlinks: [] }, topics);
    expect(byLinks.map(s => s.topic.name)).toEqual(["运维方法"]);
    const both = suggestTopics({ title: "排版 Agent", tags: ["design"], links: [], backlinks: ["30-知识/设计与内容/排版规范.md"] }, topics);
    expect(both[0].topic.name).toBe("设计与内容");
    expect(suggestTopics({ title: "无关", tags: [], links: [], backlinks: [] }, topics)).toEqual([]);
  });
  it("snoozes for seven days", () => {
    expect(isSnoozed({ "inbox-snooze": "2026-11-09" }, NOW)).toBe(true);
    expect(isSnoozed({ "inbox-snooze": "2026-11-08" }, NOW)).toBe(false);
    const q = inboxQueue([note("00-收件箱/剪藏/b.md", { ctime: 2 }), note("00-收件箱/剪藏/a.md", { ctime: 1 }), note("00-收件箱/剪藏/c.md", { frontmatter: { "inbox-snooze": "2026-11-15" } }), note("20-个人/x.md")], NOW);
    expect(q.map(n => n.title)).toEqual(["a", "b"]);
  });
  it("reads source and summary", () => {
    expect(clipSource({ url: " https://a " })).toBe("https://a");
    expect(clipSource({})).toBe("");
    expect(clipSummary({ description: "要点" }, "正文")).toBe("要点");
    expect(clipSummary({}, "---\na: 1\n---\n# 标题\n\n**粗体** [链接](http://x) ![](a.png)\n")).toBe("标题 粗体 链接");
    expect(clipSummary({}, "字".repeat(250)).length).toBe(201);
  });
  it("appends under the clip heading", () => {
    expect(clipLine("[[a]]", " 结论 ")).toBe("- [[a]] — 结论");
    expect(clipLine("[[a]]", "")).toBe("- [[a]]");
    expect(appendUnderHeading("# T\n\n正文\n", "剪藏", "- x")).toBe("# T\n\n正文\n\n## 剪藏\n\n- x\n");
    expect(appendUnderHeading("# T\n## 剪藏\n- a\n\n## 其他\nb\n", "剪藏", "- x")).toBe("# T\n## 剪藏\n- a\n- x\n\n## 其他\nb\n");
    expect(appendUnderHeading("## 剪藏\n", "剪藏", "- x")).toBe("## 剪藏\n\n- x\n");
    expect(appendUnderHeading("## 剪藏\n- a\n```\n## not\n```\n### sub\n- b\n", "剪藏", "- x")).toBe("## 剪藏\n- a\n```\n## not\n```\n### sub\n- b\n- x\n");
  });
  it("finds a free path", () => {
    const taken = new Set(["d/a.md", "d/a 2.md"]);
    expect(uniquePath("d", "a", p => taken.has(p))).toBe("d/a 3.md");
  });
});
