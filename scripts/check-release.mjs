// Pre-release self-check: node scripts/check-release.mjs [--audit]
// Mirrors what the Obsidian directory scans for, plus what must never reach the public repository.
// The directory review must come back clean: zero ESLint problems, main.js under 5 MB, no Node / Electron,
// no eval, no !important.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { changelogProblems } from "./check-changelog.mjs";

const read = file => readFileSync(file, "utf8");
const results = [];
const check = (ok, label, detail = "") => results.push({ ok, label, detail });
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));
const versions = JSON.parse(read("versions.json"));

// Manifest
check(/^\d+\.\d+\.\d+$/.test(manifest.version), "manifest version is x.y.z", manifest.version);
check(manifest.version === pkg.version, "package.json version matches manifest", `${pkg.version} / ${manifest.version}`);
check(manifest.version in versions, "versions.json lists this version");
check(/^[a-z-]+$/.test(manifest.id) && !manifest.id.endsWith("plugin") && !manifest.id.includes("obsidian"), "plugin id is valid", manifest.id);
check(/^[A-Za-z0-9 +()-]+$/.test(manifest.name) && !/obsidian|plugin/i.test(manifest.name), "name uses plain characters, no 'Obsidian' or 'Plugin'", manifest.name);
check(manifest.description.length <= 250 && manifest.description.endsWith(".") && !/\p{Extended_Pictographic}/u.test(manifest.description) && !/^this is a plugin/i.test(manifest.description), "description: ≤250 chars, ends with a period, no emoji", String(manifest.description.length));
check(typeof manifest.isDesktopOnly === "boolean", "isDesktopOnly is set");
check(existsSync("LICENSE") && existsSync("README.md"), "LICENSE and README present");
// The store type-checks .js too, where untyped code turns into a wall of no-unsafe-* warnings.
const plainJs = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" }).split("\n").filter(file => /\.(?:js|mjs|cjs)$/.test(file) && existsSync(file));
check(plainJs.length === 0, "src/ is TypeScript only (no .js files)", plainJs.join(", "));
check(new RegExp(`^## ${manifest.version.replaceAll(".", "\\.")}$`, "m").test(read("CHANGELOG.md")), "CHANGELOG has an entry for this version");

const changelogIssues = changelogProblems(read("CHANGELOG.md"));
check(changelogIssues.length === 0, "CHANGELOG version entries contain no Chinese bullet lists", changelogIssues.join(", "));

// Source patterns
const sourceFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|js)$/.test(name) && !/\.test\./.test(name)) sourceFiles.push(full);
  }
})("src");
const sourceText = sourceFiles.map(file => read(file)).join("\n");
// This one builds scripts as strings for another page (the exported reader); it never touches Obsidian's DOM.
const scriptStringFiles = ["src/modules/reader-app.ts"];
const pluginDomText = sourceFiles.filter(file => !scriptStringFiles.includes(file)).map(file => read(file)).join("\n");
const tally = (pattern, text = sourceText) => (text.match(pattern) || []).length;
check(tally(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(/g, pluginDomText) === 0, "no innerHTML / outerHTML / insertAdjacentHTML in plugin code", String(tally(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(/g, pluginDomText)));
check(tally(/console\.log\(|console\.info\(|console\.debug\(/g) === 0, "no console.log / info / debug", String(tally(/console\.(log|info|debug)\(/g)));
check(tally(/(^|\n)\s*var\s/g) === 0, "no var declarations");
check(tally(/hotkeys\s*:/g) === 0, "no default hotkeys");
check(tally(/window\.app\b|globalThis\.app\b/g) === 0, "no global app");
check(tally(/\beval\(|new Function\b|\bFunction\(/g) === 0, "no eval() or Function constructor");
check(tally(/\bfetch\(/g) === 0, "no fetch() (requestUrl instead)");
const nodeAccess = /(?:from\s*|import\(\s*)["'](?:node:)?(?:fs|path|os|child_process|electron|vm)["']|ipcRenderer|\brequire\(/g;
check(tally(nodeAccess) === 0, "no Node built-ins, Electron or require()", String(tally(nodeAccess)));
check(!/\bfetch\(["'`]https?:/.test(sourceText) || true, "network calls are user-initiated (review manually)");

// Selected rendering modules and their dependencies must satisfy the incremental strict gate.
try {
  execFileSync("npx", ["tsc", "-p", "tsconfig.strict.json", "--noEmit"], { encoding: "utf8", stdio: "pipe" });
  check(true, "incremental strict TypeScript check");
} catch (error) {
  check(false, "incremental strict TypeScript check", String(error.stdout || error.message).trim().split("\n").slice(0, 4).join("; "));
}

// Lint: the directory runs eslint-plugin-obsidianmd; every problem shows up as a review warning.
if (!process.argv.includes("--no-lint")) {
  try { execFileSync("npx", ["eslint", ".", "--format", "json", "-o", "/tmp/ib-eslint.json"], { stdio: "ignore" }); } catch { /* eslint exits non-zero when it finds problems */ }
  const report = JSON.parse(read("/tmp/ib-eslint.json"));
  const problems = report.flatMap(file => file.messages.map(message => `${path.relative(process.cwd(), file.filePath)}:${message.line} ${message.ruleId || message.message}`));
  check(problems.length === 0, "eslint: 0 errors, 0 warnings", `${problems.length} — ${problems.slice(0, 4).join(", ")}`);
}

// Stylesheets: no !important, no property declared twice in one rule.
const sheets = ["styles.css", "theme-features.css", "reveal.css"];
const important = sheets.flatMap(f => read(f).split("\n").map((line, i) => [f, i + 1, line]).filter(([, , line]) => line.includes("!important")).map(([f, no]) => `${f}:${no}`));
check(important.length === 0, "no !important in stylesheets", important.slice(0, 6).join(", "));
const repeated = [];
for (const sheet of sheets) {
  for (const [, body] of read(sheet).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\{([^{}]*)\}/g)) {
    const props = body.split(";").map(d => d.split(":")[0].trim()).filter(p => /^-?[a-z][a-z-]*$/.test(p));
    const dup = props.find((p, i) => props.indexOf(p) !== i);
    if (dup) repeated.push(`${sheet}: ${dup}`);
  }
}
check(repeated.length === 0, "no duplicate properties in a rule", repeated.slice(0, 6).join(", "));

// Build output
if (existsSync("dist/main.js")) {
  const size = statSync("dist/main.js").size / 1048576;
  check(size < 5, "dist/main.js is under 5 MB", `${size.toFixed(2)} MB`);
  const bundle = read("dist/main.js");
  const banned = ["child_process", "ipcRenderer", 'require("electron")', 'require("fs")', "new Function", "eval(", "createElement(\"script\")", "createElement('script')"].filter(token => bundle.includes(token));
  check(banned.length === 0, "dist/main.js has no Node / Electron access, eval or script injection", banned.join(", "));
}

// Nothing internal in the public repository
const files = git("ls-files").split("\n").filter(f => existsSync(f));
const internalName = /plan|roadmap|todo|notes?\.md$|handoff|交接|计划|迭代|competitor|竞品/i;
const internal = files.filter(f => internalName.test(f) && !/^(scripts\/|src\/|vendor\/|licenses\/)/.test(f));
check(internal.length === 0, "no planning or internal files tracked", internal.join(", "));
const forbidden = /\/Users\/|MyNotes|iCloud|40-归档|@gmail|@qq\.com|claude|anthropic|co-authored|vlook|blubook/i;
const textFiles = files.filter(f => /\.(md|json|mjs|ts|js|css|yml|yaml|txt)$/.test(f) && !/^(package-lock\.json|vendor\/|licenses\/|build\/)/.test(f) && f !== "scripts/check-release.mjs");
const hits = textFiles.flatMap(f => read(f).split("\n").map((line, i) => [f, i + 1, line]).filter(([, , line]) => forbidden.test(line)).map(([file, no]) => `${file}:${no}`));
check(hits.length === 0, "no personal or internal wording in tracked files", hits.slice(0, 6).join(", "));
// Phone / tablet rules must win over the desktop rules they adjust (see scripts/check-cascade.mjs).
let cascade = "";
try { execFileSync("node", ["scripts/check-cascade.mjs"], { encoding: "utf8" }); } catch (error) { cascade = String(error.stdout).trim().split("\n").pop(); }
check(!cascade, "device rules win over desktop rules", cascade);

const authors = [...new Set(git("log", "--format=%ae").split("\n"))];
check(authors.every(a => a.endsWith("@users.noreply.github.com")), "commit emails are GitHub noreply addresses", authors.join(", "));
check(git("status", "--porcelain") === "", "working tree is clean (commit before releasing)");

if (process.argv.includes("--audit")) {
  let audit = "";
  try { audit = execFileSync("npm", ["audit", "--omit=dev", "--audit-level=high"], { encoding: "utf8" }); check(true, "npm audit: no high-severity advisories"); }
  catch (error) { check(false, "npm audit: high-severity advisories found", String(error.stdout || "").split("\n").slice(-4).join(" ")); }
}

let failed = 0;
for (const { ok, label, detail } of results) {
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
