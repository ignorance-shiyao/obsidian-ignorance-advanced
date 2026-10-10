// Builds the release files: main.js (with every heavy library compressed inside it) and styles.css.
//   node esbuild.config.mjs            production build into ./dist
//   OBSIDIAN_VAULT=/path/to/vault node esbuild.config.mjs --install   also copy into the vault's plugin folder
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const generated = path.join(here, "build");
await mkdir(dist, { recursive: true });
await mkdir(generated, { recursive: true });

// 1. Language and file-type icon data (Material Icon Theme).
execFileSync(process.execPath, [path.join(here, "gen-icon-library.mjs"), path.join(generated, "language-icons.json"), path.join(generated, "file-icons.json")], { stdio: "inherit" });

// 2. Libraries that only some features use: bundled separately, then embedded compressed.
const bundle = async (entry, options) => (await build({ entryPoints: [entry], bundle: true, write: false, legalComments: "none", sourcemap: false, target: "es2022", ...options })).outputFiles[0].contents;
const embedded = {};
const add = (name, contents) => { embedded[name] = { data: gzipSync(contents, { level: 9 }).toString("base64"), size: contents.length }; };
const addFile = async (name, file) => add(name, await readFile(file));

for (const name of ["docx", "pptx", "reveal", "capture"]) {
  const contents = await bundle(path.join(here, `src/chunks/${name}.ts`), {
    platform: "browser", format: "cjs", external: ["obsidian", "electron"], supported: { "dynamic-import": false }, minify: true
  });
  // Smoke test: the plugin evaluates these with new Function(module, exports, require), so do the same here.
  try {
    const module = { exports: {} };
    new Function("module", "exports", "require", Buffer.from(contents).toString("utf8"))(module, module.exports, () => ({}));
    if (!Object.keys(module.exports).length) throw new Error("exports nothing");
  } catch (error) {
    throw new Error(`chunk-${name}.cjs does not load: ${error.message}`);
  }
  add(`chunk-${name}.cjs`, contents);
}
add("import-converters.cjs", await bundle(path.join(here, "src/modules/import-converters.js"), { platform: "node", format: "cjs" }));
await addFile("pdf.worker.mjs", path.join(here, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"));
for (const name of ["mermaid.min.js", "mermaid-zenuml.min.js", "mermaid-layout-elk.min.js", "echarts.min.js", "lucide-icons.json"]) await addFile(name, path.join(here, "vendor", name));
for (const name of ["language-icons.json", "file-icons.json"]) await addFile(name, path.join(generated, name));

const virtual = {
  name: "embedded-assets",
  setup(b) {
    b.onResolve({ filter: /^embedded-assets$/ }, () => ({ path: "embedded-assets", namespace: "embedded" }));
    b.onLoad({ filter: /.*/, namespace: "embedded" }, () => ({ contents: `export default ${JSON.stringify(embedded)};`, loader: "js" }));
  }
};

// 3. The plugin itself.
await build({
  entryPoints: [path.join(here, "src/main.ts")],
  outfile: path.join(dist, "main.js"),
  bundle: true,
  minify: !process.env.NO_MINIFY,
  keepNames: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  external: ["obsidian", "@codemirror/*", "electron"],
  supported: { "dynamic-import": false },
  sourcemap: false,
  legalComments: "none",
  plugins: [virtual]
});

// 4. Styles: the plugin's functional layout rules plus the vendored Reveal.js ones.
const styles = await Promise.all(["styles.css", "theme-features.css", "reveal.css"].map(name => readFile(path.join(here, name), "utf8")));
await writeFile(path.join(dist, "styles.css"), styles.join("\n\n"));
await copyFile(path.join(here, "manifest.json"), path.join(dist, "manifest.json"));

const total = Object.values(embedded).reduce((sum, item) => sum + item.data.length, 0);
console.log(`built dist/main.js (embedded libraries: ${(total / 1048576).toFixed(1)} MB compressed)`);

// 5. Optional: install straight into a vault for local testing.
if (process.argv.includes("--install")) {
  const vault = process.env.OBSIDIAN_VAULT;
  if (!vault) throw new Error("Set OBSIDIAN_VAULT to your vault folder");
  const target = path.join(vault, ".obsidian/plugins/ignorance-advanced");
  await mkdir(target, { recursive: true });
  for (const name of ["main.js", "styles.css", "manifest.json"]) await copyFile(path.join(dist, name), path.join(target, name));
  console.log(`installed into ${target}`);
}
