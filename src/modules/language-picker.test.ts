import { describe, expect, it } from "vitest";
import { matchLanguages, withFenceLanguage, fenceLanguage } from "./language-picker.js";

describe("language picker", () => {
  it("matches ids, aliases and labels with the best first", () => {
    expect(matchLanguages("js")[0].id).toBe("javascript");
    expect(matchLanguages("py")[0].id).toBe("python");
    expect(matchLanguages("c#")[0].id).toBe("csharp");
    expect(matchLanguages("type")[0].id).toBe("typescript");
    expect(matchLanguages("sh").map(e => e.id)).toContain("shell");
    expect(matchLanguages("zzzz")).toEqual([]);
  });
  it("lists everything for an empty query", () => {
    expect(matchLanguages("  ").length).toBeGreaterThan(40);
  });
  it("rewrites only the language word of a fence", () => {
    expect(withFenceLanguage("```ts {1,3} {align=left}", "python")).toBe("```python {1,3} {align=left}");
    expect(withFenceLanguage("```", "sql")).toBe("```sql");
    expect(withFenceLanguage("```{align=center}", "sql")).toBe("```sql {align=center}");
    expect(withFenceLanguage("  ~~~js", "")).toBe("  ~~~");
    expect(fenceLanguage("```c++ {x}")).toBe("c++");
  });
});
