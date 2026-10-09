// Writes THIRD_PARTY_NOTICES.md: every production dependency (with its transitive ones) and the
// vendored libraries, with their licenses. Run after `npm install`; commit the result.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const seen = new Map();

async function visit(name, from) {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name, "package.json");
    try {
      const data = JSON.parse(await readFile(candidate, "utf8"));
      const id = `${data.name}@${data.version}`;
      if (seen.has(id)) return;
      const license = typeof data.license === "string" ? data.license : data.license?.type || (data.licenses || []).map(l => l.type).join(" OR ") || "see package";
      seen.set(id, { name: data.name, version: data.version, license, homepage: data.homepage || data.repository?.url || "" });
      for (const dep of Object.keys(data.dependencies || {})) await visit(dep, path.dirname(candidate));
      return;
    } catch (_) {
      const parent = path.dirname(dir);
      if (parent === dir || !dir.startsWith(root)) return;
      dir = parent;
    }
  }
}
for (const dep of Object.keys(pkg.dependencies || {})) await visit(dep, root);
for (const dep of ["jszip", "material-icon-theme"]) await visit(dep, root);

const vendored = [
  ["Mermaid", "12.x", "MIT", "https://github.com/mermaid-js/mermaid", "vendor/mermaid.min.js, built with esbuild as an IIFE"],
  ["@mermaid-js/layout-elk (with elkjs)", "see bundle", "MIT (elkjs: EPL-2.0)", "https://github.com/mermaid-js/mermaid", "vendor/mermaid-layout-elk.min.js"],
  ["@mermaid-js/mermaid-zenuml", "1.0.1", "MIT", "https://github.com/mermaid-js/mermaid-zenuml", "vendor/mermaid-zenuml.min.js"],
  ["Apache ECharts", "see file header", "Apache-2.0", "https://echarts.apache.org", "vendor/echarts.min.js (NOTICE in licenses/NOTICE-echarts)"],
  ["Lucide icons via @iconify-json/lucide", "see file", "ISC", "https://lucide.dev", "vendor/lucide-icons.json (architecture diagram icons)"],
  ["Material Icon Theme", "see devDependency", "MIT", "https://github.com/material-extensions/vscode-material-icon-theme", "language and file-type icons, built into the plugin by gen-icon-library.mjs"],
  ["reveal.js", "6.x", "MIT", "https://revealjs.com", "presentation view; also listed above as a dependency"],
  ["MorphDraft", "—", "MIT", "https://github.com/ignorance-shiyao", "parts of the slide splitter (same author)"]
];

// Dual-licensed or undeclared packages: say which terms we use.
const NOTES = {
  jszip: "(MIT OR GPL-3.0-or-later) — used under MIT",
  buffers: "no license declared upstream (transitive via exceljs → unzipper → binary; xlsx import on desktop only)"
};
for (const item of seen.values()) if (NOTES[item.name]) item.license = NOTES[item.name];
const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = [
  "# Third-party notices",
  "",
  "Ignorance Advanced bundles the open-source software below. Each remains under its own license; the full texts of the main ones are in the `licenses/` folder.",
  "",
  "## Vendored libraries",
  "",
  "| Library | Version | License | Source | Notes |",
  "| --- | --- | --- | --- | --- |",
  ...vendored.map(([n, v, l, s, note]) => `| ${n} | ${v} | ${l} | ${s} | ${note} |`),
  "",
  "## npm dependencies (including transitive)",
  "",
  "| Package | Version | License |",
  "| --- | --- | --- |",
  ...rows.map(r => `| ${r.name} | ${r.version} | ${r.license} |`),
  ""
].join("\n");
await writeFile(path.join(root, "THIRD_PARTY_NOTICES.md"), out);
console.log(`THIRD_PARTY_NOTICES.md: ${rows.length} packages`);
