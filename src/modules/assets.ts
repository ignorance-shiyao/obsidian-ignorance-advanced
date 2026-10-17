import type { IgnorancePlugin } from "../plugin-types.js";
/* Large runtime libraries (Mermaid, ECharts, the import converters…) are compressed and embedded in
   main.js at build time, and unpacked the first time a feature needs one. Nothing is downloaded and
   no code is fetched from the network: Obsidian installs main.js, manifest.json and styles.css,
   so everything the plugin runs ships inside them. */
import EMBEDDED from "embedded-assets";
import { decode91 } from "./base91";

type Embedded = Record<string, { data: string; size: number }>;
const assets = EMBEDDED as Embedded;
const bytesCache = new Map<string, Promise<Uint8Array>>();

async function gunzip(packedText: string): Promise<Uint8Array> {
  const packed = decode91(packedText);
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
