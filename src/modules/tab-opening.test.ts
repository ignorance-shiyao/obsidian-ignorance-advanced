import { describe, expect, it } from "vitest";
import { installTabOpening } from "./tab-opening.js";

function setup(opts: { activeRoot?: "main" | "right"; activeType?: string; tabs?: Record<string, boolean> } = {}) {
  const rootSplit = { name: "root" }, rightSplit = { name: "right" }, leftSplit = { name: "left" };
  const leaves: any[] = [];
  const makeLeaf = (root, type = "markdown", file?) => {
    const leaf: any = {
      root, parent: root, detached: false,
      getRoot: () => root, detach() { leaf.detached = true; },
      view: { getViewType: () => type, file },
      getViewState: () => ({ type, state: { file: file?.path } }),
    };
    leaves.push(leaf);
    return leaf;
  };
  const created: any[] = [];
  const active = makeLeaf(opts.activeRoot === "right" ? rightSplit : rootSplit, opts.activeType ?? "markdown");
  const Leaf = function () {} as any;
  const opened: string[] = [];
  Leaf.prototype.openFile = function (file) { opened.push(file.path); return Promise.resolve(); };
  Object.setPrototypeOf(active, Leaf.prototype);
  const workspace: any = {
    rootSplit, rightSplit, leftSplit, activeLeaf: active,
    getLeaf(newLeaf) {
      if (newLeaf === true) { const l = makeLeaf(active.root); Object.setPrototypeOf(l, Leaf.prototype); created.push(l); return l; }
      return makeLeaf(rootSplit);
    },
    iterateAllLeaves(cb) { [...leaves].filter(l => !l.detached).forEach(cb); },
    setActiveLeaf() {},
  };
  const plugin: any = { app: { workspace }, state: { tabs: { openInNewTab: true, deduplicateTabs: true, deduplicateAcrossTabGroups: true, ...opts.tabs } }, register() {} };
  return { plugin, workspace, leaves, created, active, makeLeaf, opened, rightSplit };
}

describe("tab opening", () => {
  it("makes a new tab beside an active note", () => {
    const t = setup();
    installTabOpening(t.plugin);
    t.workspace.getLeaf();
    expect(t.created).toHaveLength(1);
  });

  it("never adds a tab to a sidebar when a panel is active", () => {
    const t = setup({ activeRoot: "right" });
    installTabOpening(t.plugin);
    const leaf = t.workspace.getLeaf();
    expect(t.created).toHaveLength(0);
    expect(leaf.root).toBe(t.workspace.rootSplit);
  });

  it("reuses an empty active tab instead of making another", () => {
    const t = setup({ activeType: "empty" });
    installTabOpening(t.plugin);
    t.workspace.getLeaf();
    expect(t.created).toHaveLength(0);
  });

  it("drops the fresh tab when the note is already open", async () => {
    const t = setup();
    const file = { path: "a.md" };
    t.makeLeaf(t.workspace.rootSplit, "markdown", file);
    installTabOpening(t.plugin);
    const leaf = t.workspace.getLeaf();
    await leaf.openFile(file);
    expect(leaf.detached).toBe(true);
    expect(t.opened).toHaveLength(0);
  });

  it("sweeps blank sidebar tabs on install", () => {
    const t = setup();
    const blank = t.makeLeaf(t.rightSplit, "empty");
    const panel = t.makeLeaf(t.rightSplit, "file-properties");
    installTabOpening(t.plugin);
    expect(blank.detached).toBe(true);
    expect(panel.detached).toBe(false);
  });
});
