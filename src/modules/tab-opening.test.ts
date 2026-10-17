import { describe, expect, it } from "vitest";
import type { IgnorancePlugin } from "../plugin-types.js";
import { installTabOpening } from "./tab-opening.js";

interface Root { name: string }
interface FakeFile { path: string }
interface FakeLeaf {
  root: Root;
  parent: Root;
  detached: boolean;
  getRoot(): Root;
  detach(): void;
  view: { getViewType(): string; file?: FakeFile; leaf?: FakeLeaf };
  getViewState(): { type: string; state: { file?: string } };
  openFile(file: FakeFile): Promise<void>;
}
interface FakeWorkspace {
  rootSplit: Root;
  rightSplit: Root;
  leftSplit: Root;
  getActiveViewOfType(): FakeLeaf["view"];
  getLeaf(newLeaf?: boolean): FakeLeaf;
  iterateAllLeaves(callback: (leaf: FakeLeaf) => void): void;
  setActiveLeaf(): void;
}

function setup(opts: { activeRoot?: "main" | "right"; activeType?: string; tabs?: Record<string, boolean> } = {}) {
  const rootSplit = { name: "root" }, rightSplit = { name: "right" }, leftSplit = { name: "left" };
  const leaves: FakeLeaf[] = [];
  const opened: string[] = [];
  // Every leaf shares one prototype, standing in for Obsidian's WorkspaceLeaf.
  const leafPrototype = { openFile(file: FakeFile) { opened.push(file.path); return Promise.resolve(); } };
  const makeLeaf = (root: Root, type = "markdown", file?: FakeFile) => {
    const leaf: FakeLeaf = Object.assign(Object.create(leafPrototype) as FakeLeaf, {
      root, parent: root, detached: false,
      getRoot: () => root, detach() { leaf.detached = true; },
      view: { getViewType: () => type, file },
      getViewState: () => ({ type, state: { file: file?.path } }),
    });
    leaf.view.leaf = leaf;
    leaves.push(leaf);
    return leaf;
  };
  const created: FakeLeaf[] = [];
  const active = makeLeaf(opts.activeRoot === "right" ? rightSplit : rootSplit, opts.activeType ?? "markdown");
  const workspace: FakeWorkspace = {
    rootSplit, rightSplit, leftSplit,
    getActiveViewOfType: () => active.view,
    getLeaf(newLeaf) {
      if (newLeaf === true) { const l = makeLeaf(active.root); created.push(l); return l; }
      return makeLeaf(rootSplit);
    },
    iterateAllLeaves(cb) { [...leaves].filter(l => !l.detached).forEach(cb); },
    setActiveLeaf() { /* focus does not matter here */ },
  };
  // Only the members the module reads exist on this stand-in for the plugin.
  const plugin = Object.assign(Object.create(null) as IgnorancePlugin, {
    app: { workspace },
    state: { tabs: { openInNewTab: true, deduplicateTabs: true, deduplicateAcrossTabGroups: true, ...opts.tabs } },
    register() { /* no teardown in the test */ },
  });
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
