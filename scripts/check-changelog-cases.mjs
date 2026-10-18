import { test } from "node:test";
import assert from "node:assert/strict";
import { changelogProblems } from "./check-changelog.mjs";

test("reject Chinese bullets in released and unreleased entries", () => {
  assert.deepEqual(changelogProblems("## Unreleased\n- 修复字体\n## 1.0.19\n- 修复导出"), ["Unreleased:2", "1.0.19:4"]);
});
test("allow prose and English lists; ignore fenced examples and other sections", () => {
  assert.deepEqual(changelogProblems("## 1.0.19\n修复字体。\n- Export fixes\n```md\n- 示例\n```\n## Notes\n- 内部示例"), []);
});
