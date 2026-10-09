/* Large runtime libraries (Mermaid, ECharts, the import converters…) are compressed and embedded in
   main.js at build time, and unpacked the first time a feature needs one. Nothing is downloaded and
   no code is fetched from the network: Obsidian installs main.js, manifest.json and styles.css,
   so everything the plugin runs ships inside them. */
import EMBEDDED from "embedded-assets";

type Embedded = Record<string, { data: string; size: number }>;
const assets = EMBEDDED as Embedded;
const bytesCache = new Map<string, Promise<Uint8Array>>();

async function gunzip(base64: string): Promise<Uint8Array> {
  const binary = atob(base64);
  const packed = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function hasAsset(name: string) { return name in assets; }

export function readAssetBytes(name: string): Promise<Uint8Array> {
  if (!hasAsset(name)) return Promise.reject(new Error(`Unknown embedded asset: ${name}`));
  if (!bytesCache.has(name)) bytesCache.set(name, gunzip(assets[name].data));
  return bytesCache.get(name)!;
}

// Kept as (plugin, name) so every caller reads the same way; the plugin argument is no longer needed.
export async function readAsset(_plugin, name: string): Promise<string> {
  return new TextDecoder().decode(await readAssetBytes(name));
}

/* The Markdown converters are a Node module (desktop only) that must be loadable with require().
   Write them, with the PDF worker they sit beside, to a versioned folder in the OS temp directory
   once, and hand back the path. */
export async function materializeConverters(plugin): Promise<string> {
  const fs = require("fs"), path = require("path"), os = require("os");
  const folder = path.join(os.tmpdir(), `ignorance-advanced-${plugin.manifest.version}`);
  fs.mkdirSync(folder, { recursive: true });
  for (const name of ["import-converters.cjs", "pdf.worker.mjs"]) {
    const target = path.join(folder, name);
    if (!fs.existsSync(target) || fs.statSync(target).size !== assets[name].size) fs.writeFileSync(target, await readAssetBytes(name));
  }
  return path.join(folder, "import-converters.cjs");
}
