// Builds the release files: main.js (libraries behind lazily initialised imports) and styles.css.
//   node esbuild.config.mjs            production build into ./dist
//   OBSIDIAN_VAULT=/path/to/vault node esbuild.config.mjs --install   also copy into the vault's plugin folder
import { build, transform } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, readdir, rm } from "node:fs/promises";
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

// 2. Icon data that only some features use: embedded compressed, unpacked on first use.
const embedded = {};
// The text packer lives in src/modules/base91.ts (the plugin unpacks with it); load that same file here.
const { encode91 } = await import("data:text/javascript;base64," + Buffer.from((await transform(await readFile(path.join(here, "src/modules/base91.ts"), "utf8"), { loader: "ts", format: "esm" })).code).toString("base64"));
const add = (name, contents) => { embedded[name] = { data: encode91(gzipSync(contents, { level: 9 })), size: contents.length }; };
const addFile = async (name, file) => add(name, await readFile(file));

await addFile("lucide-icons.json", path.join(here, "vendor", "lucide-icons.json"));
for (const name of ["language-icons.json", "file-icons.json"]) await addFile(name, path.join(generated, name));

const virtual = {
  name: "embedded-assets",
  setup(b) {
    b.onResolve({ filter: /^embedded-assets$/ }, () => ({ path: "embedded-assets", namespace: "embedded" }));
    b.onLoad({ filter: /.*/, namespace: "embedded" }, () => ({ contents: `export default ${JSON.stringify(embedded)};`, loader: "js" }));
  }
};

/* Bundled libraries carry a few Function-constructor tricks (polyfills and
   a legacy JSON fallback) that Obsidian's renderer never needs. Rewrite them
   to plain code; each pattern must match exactly as often as expected, so a
   library update that changes them fails the build instead of slipping by. */
const NO_EVAL = [
  { file: /node_modules\/docx\/dist\/index\.mjs$/, rules: [
    ['return $Function("\\"use strict\\"; return (" + expressionSyntax + ").constructor;")();', 'return ({ "function* () {}": Object.getPrototypeOf(function* () {}), "async function* () {}": Object.getPrototypeOf(async function* () {}), "async function () {}": Object.getPrototypeOf(async function () {}) })[expressionSyntax]?.constructor;', 1],
    ['bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);', 'bound = function() { return binder.apply(this, arguments); };', 1],
    ['return Function("return function*() {}")();', 'return function* () {};', 1],
    ['"function" != typeof e && (e = new Function("" + e));', '"function" != typeof e && (e = function() { throw new TypeError("setImmediate needs a function"); });', 1]
  ] },
  { file: /node_modules\/jszip\/dist\/jszip\.min\.js$/, rules: [
    ['"function"!=typeof e&&(e=new Function(""+e));', '"function"!=typeof e&&(e=function(){throw new TypeError("setImmediate needs a function")});', 1]
  ] },
  { file: /node_modules\/echarts\/lib\/coord\/geo\/GeoJSONResource\.js$/, rules: [
    ["new Function('return (' + source + ');')()", "JSON.parse(source)", 1]
  ] }
];
const noEval = {
  name: "no-eval",
  setup(b) {
    b.onLoad({ filter: /node_modules\/(?:docx|jszip|echarts)\/.*\.m?js$/ }, async args => {
      const entry = NO_EVAL.find(item => item.file.test(args.path));
      if (!entry) return undefined;
      let contents = await readFile(args.path, "utf8");
      for (const [from, to, expected] of entry.rules) {
        const count = contents.split(from).length - 1;
        if (count !== expected) throw new Error(`no-eval: ${path.basename(args.path)} has ${count} × ${from.slice(0, 50)}…`);
        contents = contents.split(from).join(to);
      }
      return { contents, loader: "js" };
    });
  }
};

// 3. The plugin itself.
await build({
  entryPoints: [path.join(here, "src/main.ts")],
  outfile: path.join(dist, "main.js"),
  bundle: true,
  minify: !process.env.NO_MINIFY,
  keepNames: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["obsidian", "@codemirror/*", "electron"],
  supported: { "dynamic-import": false },
  sourcemap: false,
  legalComments: "none",
  plugins: [virtual, noEval]
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
  // Builds before 1.0.0 shipped these beside main.js; everything is embedded now, and the old copies
  // would only keep syncing megabytes with the vault.
  const stale = ["chunk-docx.cjs", "chunk-pptx.cjs", "chunk-reveal.cjs", "chunk-capture.cjs", "import-converters.cjs", "pdf.worker.mjs", "file-icons.json", "language-icons.json", "NOTICE-echarts", "README.md"];
  const removed = (await readdir(target)).filter(name => stale.includes(name) || name.startsWith("LICENSE-"));
  for (const name of removed) await rm(path.join(target, name));
  console.log(`installed into ${target}${removed.length ? ` (removed ${removed.length} old files)` : ""}`);
}
