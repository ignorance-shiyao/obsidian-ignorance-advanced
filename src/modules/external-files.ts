/* Open Markdown files that live outside the vault (desktop).
   Finder hands a file to the "Obsidian 打开器" helper app, which calls
   obsidian://ignorance-open?src=<absolute path> (`path` is taken by Obsidian's
   main process, which drops paths outside every vault). A file inside this
   vault just opens. Any other file opens in a light view that reads and writes
   the original directly (external-view.ts); from there 导入到库中编辑 copies it
   into 外部文件/ for the full editor. Edits to that copy are written back to
   the original as they happen, changes made to the original elsewhere are
   pulled in when the copy is focused again, and the copy is removed once no tab
   shows it. */
import { electronRemote, hasDesktopExports } from "./desktop-runtime.js";
import { EXTERNAL_VIEW, ExternalMarkdownView } from "./external-view.js";

const { Notice, TFile, normalizePath } = require("obsidian");

export const EXTERNAL_FOLDER = "外部文件";
const PROTOCOL = "ignorance-open";

function nodeFs() { return require("fs"); }
function nodePath() { return require("path"); }

function vaultRoot(plugin) {
  const adapter = plugin.app.vault.adapter;
  return typeof adapter?.getBasePath === "function" ? adapter.getBasePath() : "";
}

function links(plugin) {
  plugin.state.externalFiles ||= {};
  return plugin.state.externalFiles;
}

// Stored instead of the text: data.json syncs, notes can be large.
function digest(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function sourceMtime(source) {
  try { return nodeFs().statSync(source).mtimeMs; } catch (_) { return null; }
}

// Pick 外部文件/<name>.md, or <name> (<parent folder>).md, or add a number.
function mirrorPathFor(plugin, source) {
  const path = nodePath();
  const vault = plugin.app.vault;
  const map = links(plugin);
  const extension = path.extname(source);
  const stem = path.basename(source, extension);
  const parent = path.basename(path.dirname(source));
  const candidates = [stem, `${stem} (${parent})`];
  for (let index = 2; candidates.length < 50; index += 1) candidates.push(`${stem} (${parent} ${index})`);
  for (const name of candidates) {
    const candidate = normalizePath(`${EXTERNAL_FOLDER}/${name}${extension}`);
    if (!vault.getAbstractFileByPath(candidate) && !map[candidate]) return candidate;
  }
  return normalizePath(`${EXTERNAL_FOLDER}/${stem} ${Date.now()}${extension}`);
}

async function openInVault(plugin, file, leaf = plugin.app.workspace.getLeaf(false)) {
  await leaf.openFile(file);
}

// Finder's entry point: a vault note opens as usual, anything else in the light view.
export async function openExternalFile(plugin, source) {
  const path = nodePath();
  const absolute = path.resolve(String(source || ""));
  if (!absolute || !nodeFs().existsSync(absolute)) {
    new Notice(`找不到文件：${absolute}`, 6000);
    return;
  }
  const vault = plugin.app.vault;
  const root = vaultRoot(plugin);
  // Inside this vault: open the note itself.
  const relative = root ? path.relative(root, absolute) : "";
  if (root && relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    const file = vault.getAbstractFileByPath(normalizePath(relative.split(path.sep).join("/")));
    if (file instanceof TFile) return openInVault(plugin, file);
  }
  const { workspace } = plugin.app;
  const shown = workspace.getLeavesOfType(EXTERNAL_VIEW).find(leaf => leaf.view.src === absolute);
  if (shown) { workspace.setActiveLeaf(shown, { focus: true }); await shown.view.reload(); return; }
  const copied = Object.keys(links(plugin)).find(key => links(plugin)[key].source === absolute);
  if (copied) return importExternalFile(plugin, absolute);
  const leaf = workspace.getLeaf(false);
  await leaf.setViewState({ type: EXTERNAL_VIEW, active: true, state: { src: absolute } });
  workspace.setActiveLeaf(leaf, { focus: true });
}

// Copy into 外部文件/ and open with Obsidian's own editor (in `leaf` if given).
export async function importExternalFile(plugin, absolute, leaf) {
  const vault = plugin.app.vault;
  const map = links(plugin);
  // Already mirrored: refresh from the original and focus it.
  const existing = Object.keys(map).find(key => map[key].source === absolute);
  if (existing) {
    const file = vault.getAbstractFileByPath(existing);
    if (file instanceof TFile) {
      await pullFromSource(plugin, file);
      return openInVault(plugin, file, leaf);
    }
    delete map[existing];
  }
  const text = nodeFs().readFileSync(absolute, "utf8");
  if (!vault.getAbstractFileByPath(EXTERNAL_FOLDER)) await vault.createFolder(EXTERNAL_FOLDER).catch(() => {});
  const mirror = mirrorPathFor(plugin, absolute);
  map[mirror] = { source: absolute, mtime: sourceMtime(absolute), hash: digest(text) };
  plugin.saveStoredState();
  const file = await vault.create(mirror, text);
  await openInVault(plugin, file, leaf);
  new Notice(`已导入到 ${EXTERNAL_FOLDER}/，修改会同步写回原文件；关掉标签页后副本自动删除。`, 6000);
}

// The copy changed in Obsidian: write it to the original.
async function pushToSource(plugin, file) {
  const entry = links(plugin)[file.path];
  if (!entry) return;
  const text = await plugin.app.vault.read(file);
  if (digest(text) === entry.hash) return;
  const mtime = sourceMtime(entry.source);
  if (mtime === null) {
    new Notice(`原文件已不存在，未能写回：${entry.source}`, 8000);
    return;
  }
  // Changed on disk since we last synced, and not by us: keep both.
  if (entry.mtime !== null && mtime > entry.mtime + 1) {
    const conflict = entry.source.replace(/(\.[^./]+)?$/, " (Obsidian 冲突副本)$1");
    nodeFs().writeFileSync(conflict, text, "utf8");
    new Notice(`原文件在别处也被修改过，Obsidian 里的版本另存为：\n${conflict}`, 10000);
    return;
  }
  nodeFs().writeFileSync(entry.source, text, "utf8");
  entry.hash = digest(text);
  entry.mtime = sourceMtime(entry.source);
  plugin.saveStoredState();
}

// The original changed elsewhere: bring the copy up to date.
async function pullFromSource(plugin, file) {
  const entry = links(plugin)[file.path];
  if (!entry) return;
  const mtime = sourceMtime(entry.source);
  if (mtime === null || entry.mtime === null || mtime <= entry.mtime + 1) return;
  const current = await plugin.app.vault.read(file);
  if (digest(current) !== entry.hash) return; // unsaved-back edits here; pushToSource resolves it
  const text = nodeFs().readFileSync(entry.source, "utf8");
  entry.hash = digest(text);
  entry.mtime = mtime;
  plugin.saveStoredState();
  if (text !== current) await plugin.app.vault.process(file, () => text);
}

// Drop copies no tab shows any more (and records whose copy is gone).
async function sweepMirrors(plugin) {
  const map = links(plugin);
  const shown = new Set();
  plugin.app.workspace.iterateAllLeaves(leaf => {
    const path = leaf.view?.file?.path || leaf.getViewState?.()?.state?.file;
    if (path) shown.add(path);
  });
  let changed = false;
  for (const key of Object.keys(map)) {
    if (shown.has(key)) continue;
    const file = plugin.app.vault.getAbstractFileByPath(key);
    if (file instanceof TFile) {
      await pushToSource(plugin, file);
      await plugin.app.vault.delete(file);
    }
    delete map[key];
    changed = true;
  }
  if (changed) plugin.saveStoredState();
  // Leave no empty 外部文件/ behind in the file list.
  const folder = plugin.app.vault.getAbstractFileByPath(EXTERNAL_FOLDER);
  if (folder && Array.isArray(folder.children) && !folder.children.length) await plugin.app.vault.delete(folder, true).catch(() => {});
}

export function installExternalFiles(plugin) {
  if (!hasDesktopExports()) return;
  const { workspace, vault } = plugin.app;
  plugin.registerView(EXTERNAL_VIEW, leaf => new ExternalMarkdownView(leaf, plugin, importExternalFile));
  // Finder → Obsidian.app: the main process only acts on files inside a known
  // vault and drops the rest. Listen there too (through remote) and open
  // Markdown ourselves. Needs Obsidian running: a file that launches it arrives
  // before plugins load, which is what the 打开器 helper covers.
  const app = electronRemote()?.app;
  if (app?.on) {
    const onOpenFile = (_event, file) => {
      if (!/\.(md|markdown)$/i.test(String(file))) return;
      void openExternalFile(plugin, file).catch(error => new Notice(`打开文件失败：${error.message || error}`, 8000));
    };
    app.on("open-file", onOpenFile);
    plugin.register(() => app.removeListener("open-file", onOpenFile));
  }
  plugin.registerObsidianProtocolHandler(PROTOCOL, params => {
    if (params.src) void openExternalFile(plugin, params.src).catch(error => {
      console.error("Ignorance Advanced: open external file failed —", error);
      new Notice(`打开库外文件失败：${error.message || error}`, 8000);
    });
  });
  const writes = new Map();
  plugin.registerEvent(vault.on("modify", file => {
    if (!(file instanceof TFile) || !links(plugin)[file.path]) return;
    // Obsidian saves every couple of seconds while typing; coalesce.
    window.clearTimeout(writes.get(file.path));
    writes.set(file.path, window.setTimeout(() => {
      writes.delete(file.path);
      void pushToSource(plugin, file).catch(error => new Notice(`写回原文件失败：${error.message || error}`, 8000));
    }, 300));
  }));
  plugin.registerEvent(vault.on("rename", (file, oldPath) => {
    const map = links(plugin);
    if (!map[oldPath]) return;
    map[file.path] = map[oldPath];
    delete map[oldPath];
    plugin.saveStoredState();
  }));
  plugin.registerEvent(vault.on("delete", file => {
    const map = links(plugin);
    if (map[file.path]) { delete map[file.path]; plugin.saveStoredState(); }
  }));
  plugin.registerEvent(workspace.on("file-open", file => { if (file) void pullFromSource(plugin, file); }));
  plugin.registerDomEvent(window, "focus", () => {
    const file = workspace.getActiveFile();
    if (file) void pullFromSource(plugin, file);
  });
  let sweep = 0;
  plugin.registerEvent(workspace.on("layout-change", () => {
    window.clearTimeout(sweep);
    sweep = window.setTimeout(() => void sweepMirrors(plugin), 1000);
  }));
  workspace.onLayoutReady(() => void sweepMirrors(plugin));
}
