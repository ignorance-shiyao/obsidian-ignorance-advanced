import { describe, expect, it } from "vitest";
import { applyEdits, checkStructure } from "./structure-check-core";

const fixed = (source: string) => applyEdits(source, checkStructure(source).flatMap(issue => issue.fix ? [issue.fix] : []));

describe("typesetting fixes", () => {
  const cases: [string, string][] = [
    ["使用Obsidian写作", "使用 Obsidian 写作"],
    ["Obsidian是工具", "Obsidian 是工具"],
    ["用React和Vue", "用 React 和 Vue"],
    ["你好,世界", "你好，世界"],
    ["注意;请看", "注意；请看"],
    ["真的吗?是的", "真的吗？是的"],
    ["太好了!谢谢", "太好了！谢谢"],
    ["提示:内容", "提示：内容"],
    ["这是结尾.", "这是结尾。"],
    ["这是结尾. 下一句", "这是结尾。 下一句"],
    ["版本1.2很好", "版本1.2很好"],
    ["时间:10:30", "时间：10:30"],
    ["看这里:https://a.com/x", "看这里：https://a.com/x"],
    ["网址https://a.com/中文页面", "网址https://a.com/中文页面"],
    ["代码`中文code中文`不动", "代码`中文code中文`不动"],
    ["公式$a中文b$不动", "公式$a中文b$不动"],
    ["链接[文字text](https://x.com/页面page)", "链接[文字 text](https://x.com/页面page)"],
    ["内链[[笔记abc]]不动", "内链[[笔记abc]]不动"],
    ["嵌入![[图片abc.png]]", "嵌入![[图片abc.png]]"],
    ["徽章((green:通过pass))不动", "徽章((green:通过pass))不动"],
    ["标识中文 {#fig-a}", "标识中文 {#fig-a}"],
    ["<span class=\"中文a\">中文abc</span>里", "<span class=\"中文a\">中文 abc</span>里"],
    ["脚注[^note1]引用", "脚注[^note1]引用"],
    ["第3章和2026年", "第3章和2026年"],
    ["已经 有 空格 English 了", "已经 有 空格 English 了"],
    ["全角，标点：正常。", "全角，标点：正常。"],
    ["**加粗**English文字", "**加粗**English 文字"],
    ["English，中文", "English，中文"],
    ["中文(括号)", "中文(括号)"],
    ["a,b,c 纯英文", "a,b,c 纯英文"],
    ["这是1.内容", "这是1.内容"],
    ["多处中文English和中文Word", "多处中文 English 和中文 Word"],
    ["比例50%中文", "比例50%中文"],
    ["# 标题Title", "# 标题 Title"],
    ["- 列表Item项", "- 列表 Item 项"],
    ["> 引用Quote文", "> 引用 Quote 文"],
    ["| 列A | 列中文B |", "| 列 A | 列中文 B |"],
    ["==高亮==English中", "==高亮==English 中"],
    ["~~删除~~中文a", "~~删除~~中文 a"],
    ["中文,English,中文", "中文，English,中文"]
  ];
  it.each(cases)("%s", (input, expected) => { expect(fixed(input)).toBe(expected); });
  it("covers forty cases", () => { expect(cases.length).toBe(40); });

  it("leaves code blocks, math blocks, front matter and container fences alone", () => {
    const source = "---\ntitle: 中文abc\n---\n```js\nconst a = '中文abc,中文';\n```\n$$\nx中文y\n$$\n::: tabs 中文abc\n:::\n正文中文abc。\n";
    const result = fixed(source);
    expect(result).toBe(source.replace("正文中文abc。", "正文中文 abc。"));
  });
  it("is idempotent", () => {
    const once = fixed("使用Obsidian写作,很好.");
    expect(fixed(once)).toBe(once);
  });
});

describe("structure reports", () => {
  it("finds heading jumps but not fake headings in code", () => {
    const issues = checkStructure("# 一\n#### 四\n```\n# 假标题\n###### 假\n```\n## 二\n");
    expect(issues.filter(issue => issue.kind === "heading-skip").map(issue => issue.line)).toEqual([1]);
  });
  it("reports broken references and duplicate caption ids, ignoring references in code", () => {
    const source = "![图 {#fig-a}](a.png)\n![图二 {#fig-a}](b.png)\n\n见 ((ref:fig-a)) 和 ((ref:gone)) 和 `((ref:code))`\n";
    const issues = checkStructure(source);
    expect(issues.map(issue => issue.kind)).toEqual(["duplicate-id", "broken-ref"]);
  });
  it("does not flag heading levels that only go down by one or restart", () => {
    expect(checkStructure("## 二\n### 三\n# 一\n## 二\n")).toEqual([]);
  });
});
