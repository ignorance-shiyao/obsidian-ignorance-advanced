import { describe, expect, it } from "vitest";
import { SNIPPET_TEMPLATES } from "./snippets";
import { SNIPPET_EN, localizeSnippetBody } from "./snippets-en";

describe("snippet English", () => {
  it("covers every Chinese run in every template body", () => {
    for (const snippet of SNIPPET_TEMPLATES) {
      for (const run of snippet.body.match(/[一-龥]+/g) ?? []) expect(SNIPPET_EN[run], `${snippet.id}: ${run}`).toBeTruthy();
      expect(localizeSnippetBody(snippet.body)).not.toMatch(/[一-龥]/);
    }
  });
  it("keeps exactly the placeholder marks of the Chinese template", () => {
    for (const snippet of SNIPPET_TEMPLATES) {
      const marks = (text: string) => (text.match(/⟦[^⟧]+⟧/g) ?? []).length;
      expect(marks(localizeSnippetBody(snippet.body)), snippet.id).toBe(marks(snippet.body));
    }
  });
  it("keeps state diagram names single words, since Mermaid uses them as identifiers", () => {
    const state = SNIPPET_TEMPLATES.find(item => item.id === "state");
    if (!state) throw new Error("no state snippet");
    const names = localizeSnippetBody(state.body).split("\n").flatMap(line => line.match(/^\s*(\w+) -->/)?.[1] ?? []);
    expect(names.length).toBeGreaterThan(3);
  });
});
