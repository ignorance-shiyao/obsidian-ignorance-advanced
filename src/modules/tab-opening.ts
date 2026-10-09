/* --------------------------------------------------------------------------
 * Default new-tab behavior
 * -------------------------------------------------------------------------- */

// Views that follow a note rather than show it.
const COMPANION_VIEWS = new Set(["file-properties", "outline", "backlink", "outgoing-link", "localgraph", "tag", "all-properties"]);

function installTabOpening(plugin) {
  const workspace = plugin.app.workspace;
  if (!workspace || plugin.tabOpeningInstalled) return;
  const originalGetLeaf = workspace.getLeaf;
  const leafPrototype = workspace.activeLeaf && Object.getPrototypeOf(workspace.activeLeaf);
  const originalOpenFile = leafPrototype?.openFile;
  if (typeof originalGetLeaf !== "function" || typeof originalOpenFile !== "function") return;

  // A plain open (no modifier) goes to the tab that already shows the note;
  // an explicit new tab / split / window (e.g. Cmd-click) is left alone.
  const getLeaf = function(newLeaf, ...args) {
    const plain = newLeaf === undefined || newLeaf === null || newLeaf === false;
    const canReuseEmpty = workspace.activeLeaf?.view?.getViewType?.() === "empty";
    // A new tab is made beside the active one; from a sidebar panel (Properties, Outline…) that
    // would add a tab to the sidebar, so let Obsidian pick the main-area leaf instead.
    const activeRoot = workspace.activeLeaf?.getRoot?.();
    const inSidebar = activeRoot === workspace.leftSplit || activeRoot === workspace.rightSplit;
    const useDefaultTab = plain && plugin.state.tabs.openInNewTab && !canReuseEmpty && !inSidebar;
    const leaf = originalGetLeaf.call(this, useDefaultTab ? true : newLeaf, ...args);
    if (plain && leaf) leaf._ibOpenPlain = { created: useDefaultTab, empty: canReuseEmpty };
    return leaf;
  };
  const openFile = function(file, ...args) {
    const plain = this._ibOpenPlain; delete this._ibOpenPlain;
    const path = file?.path;
    if (plain && plugin.state.tabs.deduplicateTabs && path) {
      let match = null;
      workspace.iterateAllLeaves(leaf => {
        if (match || leaf === this) return;
        if (!plugin.state.tabs.deduplicateAcrossTabGroups && leaf.parent !== this.parent) return;
        // Only a tab that shows the note counts. Sidebar panels (Properties,
        // Outline, Backlinks…) also remember a file; matching one "opened"
        // the note in a collapsed sidebar, so the click seemed to do nothing.
        const root = leaf.getRoot?.();
        if (root === workspace.leftSplit || root === workspace.rightSplit) return;
        const viewState = leaf.getViewState?.();
        if (COMPANION_VIEWS.has(viewState?.type)) return;
        const openedPath = leaf.view?.file?.path || viewState?.state?.file;
        if (openedPath === path) match = leaf;
      });
      if (match) {
        // Drop the tab we just made (or the blank one we were about to fill).
        if (plain.created || plain.empty) this.detach();
        workspace.setActiveLeaf(match, { focus: true });
        // Honor a heading / line target on the existing tab.
        const state = args[0]?.eState;
        if (state) match.setEphemeralState?.(state);
        return Promise.resolve();
      }
    }
    const opened = originalOpenFile.call(this, file, ...args);
    // Mobile creates the new tab in the background, so the note would only
    // come to the front on a second tap (via the dedupe branch above).
    if (plain?.created) workspace.setActiveLeaf(this, { focus: true });
    return opened;
  };
  workspace.getLeaf = getLeaf;
  leafPrototype.openFile = openFile;
  // Earlier versions left blank tabs piling up in the sidebars; sweep them away.
  for (const split of [workspace.leftSplit, workspace.rightSplit]) {
    const blanks = [];
    workspace.iterateAllLeaves(leaf => { if (leaf.getRoot?.() === split && leaf.view?.getViewType?.() === "empty") blanks.push(leaf); });
    for (const leaf of blanks) leaf.detach();
  }
  plugin.tabOpeningInstalled = true;
  plugin.register(() => {
    if (workspace.getLeaf === getLeaf) workspace.getLeaf = originalGetLeaf;
    if (leafPrototype.openFile === openFile) leafPrototype.openFile = originalOpenFile;
    workspace.iterateAllLeaves(leaf => { delete leaf._ibOpenPlain; });
    plugin.tabOpeningInstalled = false;
  });
}

export { installTabOpening };
