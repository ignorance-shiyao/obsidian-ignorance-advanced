import { View } from "obsidian";
import type { TFile, WorkspaceLeaf } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
/* --------------------------------------------------------------------------
 * Default new-tab behavior
 * -------------------------------------------------------------------------- */

// Views that follow a note rather than show it.
const COMPANION_VIEWS = new Set(["file-properties", "outline", "backlink", "outgoing-link", "localgraph", "tag", "all-properties"]);

// How the open that is in flight was started, remembered per leaf until its openFile runs.
interface OpenMark { created: boolean; empty: boolean }
type GetLeaf = (this: unknown, newLeaf?: unknown, ...args: unknown[]) => WorkspaceLeaf;
type OpenFile = (this: WorkspaceLeaf, file: TFile, ...args: unknown[]) => Promise<void>;
// The two methods this module swaps out, described without Obsidian's overloads.
interface PatchableWorkspace { getLeaf: GetLeaf }
interface PatchableLeafPrototype { openFile: OpenFile }
// A view that shows a file (FileView) as far as this module needs to know.
interface FileLikeView { file?: { path?: string } | null }

function installTabOpening(plugin: IgnorancePlugin) {
  const workspace = plugin.app.workspace;
  if (!workspace || plugin.tabOpeningInstalled) return;
  const patchable: PatchableWorkspace = workspace;
  const marks = new WeakMap<WorkspaceLeaf, OpenMark>();
  // The leaf of the active view, in the main area or a sidebar.
  const activeLeaf = () => workspace.getActiveViewOfType(View)?.leaf;
  const originalGetLeaf = patchable.getLeaf;
  const active = activeLeaf();
  const leafPrototype = (active && Object.getPrototypeOf(active)) as PatchableLeafPrototype | undefined;
  const originalOpenFile = leafPrototype?.openFile;
  if (typeof originalGetLeaf !== "function" || typeof originalOpenFile !== "function") return;

  // A plain open, or an explicit new tab (Cmd-click, "Open in new tab"), goes to the tab that already shows the
  // note instead of making a second one; an explicit split / window is left alone, so the same note can
  // still be shown twice on purpose.
  const getLeaf: GetLeaf = function(newLeaf, ...args) {
    const plain = newLeaf === undefined || newLeaf === null || newLeaf === false;
    const current = activeLeaf();
    const canReuseEmpty = current?.view?.getViewType?.() === "empty";
    // A new tab is made beside the active one; from a sidebar panel (Properties, Outline…) that
    // would add a tab to the sidebar, so let Obsidian pick the main-area leaf instead.
    const activeRoot = current?.getRoot?.();
    const inSidebar = activeRoot === workspace.leftSplit || activeRoot === workspace.rightSplit;
    const useDefaultTab = plain && plugin.state.tabs.openInNewTab && !canReuseEmpty && !inSidebar;
    const explicitTab = newLeaf === true || newLeaf === "tab";
    const leaf = Reflect.apply<unknown, unknown[], WorkspaceLeaf>(originalGetLeaf, this, [useDefaultTab ? true : newLeaf, ...args]);
    if (plain && leaf) marks.set(leaf, { created: useDefaultTab, empty: canReuseEmpty });
    else if (explicitTab && leaf) {
      // Only an openFile that follows straight away is part of this open.
      const mark = { created: true, empty: false };
      marks.set(leaf, mark);
      window.setTimeout(() => { if (marks.get(leaf) === mark) marks.delete(leaf); }, 1000);
    }
    return leaf;
  };
  const openFile: OpenFile = function(file, ...args) {
    const plain = marks.get(this);
    marks.delete(this);
    const path = file?.path;
    if (plain && plugin.state.tabs.deduplicateTabs && path) {
      const matches: WorkspaceLeaf[] = [];
      workspace.iterateAllLeaves(leaf => {
        if (matches.length || leaf === this) return;
        if (!plugin.state.tabs.deduplicateAcrossTabGroups && leaf.parent !== this.parent) return;
        // Only a tab that shows the note counts. Sidebar panels (Properties,
        // Outline, Backlinks…) also remember a file; matching one "opened"
        // the note in a collapsed sidebar, so the click seemed to do nothing.
        const root = leaf.getRoot?.();
        if (root === workspace.leftSplit || root === workspace.rightSplit) return;
        const viewState = leaf.getViewState?.();
        if (COMPANION_VIEWS.has(viewState?.type)) return;
        const openedPath = (leaf.view as FileLikeView | undefined)?.file?.path || viewState?.state?.file;
        if (openedPath === path) matches.push(leaf);
      });
      const match = matches[0];
      if (match) {
        // Drop the tab we just made (or the blank one we were about to fill).
        if (plain.created || plain.empty) this.detach();
        workspace.setActiveLeaf(match, { focus: true });
        // Honor a heading / line target on the existing tab.
        const state = (args[0] as { eState?: unknown } | undefined)?.eState;
        if (state) match.setEphemeralState?.(state);
        return Promise.resolve();
      }
    }
    const opened = Reflect.apply<unknown, unknown[], Promise<void>>(originalOpenFile, this, [file, ...args]);
    // Mobile creates the new tab in the background, so the note would only
    // come to the front on a second tap (via the dedupe branch above).
    if (plain?.created) workspace.setActiveLeaf(this, { focus: true });
    return opened;
  };
  patchable.getLeaf = getLeaf;
  leafPrototype.openFile = openFile;
  // Earlier versions left blank tabs piling up in the sidebars; sweep them away.
  for (const split of [workspace.leftSplit, workspace.rightSplit]) {
    const blanks: WorkspaceLeaf[] = [];
    workspace.iterateAllLeaves(leaf => { if (leaf.getRoot?.() === split && leaf.view?.getViewType?.() === "empty") blanks.push(leaf); });
    for (const leaf of blanks) leaf.detach();
  }
  plugin.tabOpeningInstalled = true;
  plugin.register(() => {
    if (patchable.getLeaf === getLeaf) patchable.getLeaf = originalGetLeaf;
    if (leafPrototype.openFile === openFile) leafPrototype.openFile = originalOpenFile;
    workspace.iterateAllLeaves(leaf => { marks.delete(leaf); });
    plugin.tabOpeningInstalled = false;
  });
}

export { installTabOpening };
