/* Code that only exports and slides need (Word, PPTX, Reveal.js — about
   1.7 MB) lives in separate chunk files next to main.js, so Obsidian does not
   parse it on every start. A chunk is read and evaluated the first time it is
   used; this works on mobile too, where Node's require cannot load files. */
import { readAsset } from "./assets.js";

let host = null;
const loaded = new Map();

export const CHUNK_FILES = ["chunk-docx.cjs", "chunk-pptx.cjs", "chunk-reveal.cjs", "chunk-capture.cjs"];

export function setChunkHost(plugin) {
  host = plugin;
}

export function loadChunk(name) {
  if (!loaded.has(name)) {
    const job = (async () => {
      if (!host) throw new Error("Ignorance Advanced is not loaded");
      const source = await readAsset(host, name);
      const module = { exports: {} };
      // The chunks are CommonJS bundles; hand them the plugin's own require.
      // On mobile that require throws for anything but Obsidian's modules, and
      // bundled libraries probe for Node built-ins (JSZip asks for "stream"):
      // answer those with an empty module so they pick their browser path.
      const safeRequire = name => {
        try { return require(name) || {}; } catch (_) { return {}; }
      };
      new Function("module", "exports", "require", source)(module, module.exports, safeRequire);
      return module.exports;
    })();
    job.catch(() => loaded.delete(name));
    loaded.set(name, job);
  }
  return loaded.get(name);
}
