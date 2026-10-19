// Lists every literal key passed to tr() and reports the ones missing from src/i18n-en.ts.
//   node scripts/i18n-keys.mjs          report only
//   node scripts/i18n-keys.mjs --list   print the missing keys as JSON
import { readFileSync, readdirSync } from "node:fs";
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const keys = new Set();
for (const f of walk("src").filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("i18n")))
  for (const m of readFileSync(f, "utf8").matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
// Names registered as tr(variable): command names kept as data in snippets.ts and table-editor.ts.
const snippets = readFileSync("src/modules/snippets.ts", "utf8");
for (const m of snippets.matchAll(/\bname: "([^"]*[一-龥][^"]*)"/g)) if (!m[1].endsWith("：")) keys.add(m[1]);
for (const m of snippets.matchAll(/^\s*(mermaid|echarts)\("[^"]+", "([^"]+)"/gm)) keys.add(`插入 ${m[1] === "mermaid" ? "Mermaid" : "ECharts"} 模板：${m[2]}`);
for (const m of readFileSync("src/modules/table-editor.ts", "utf8").matchAll(/\bname: "([^"]*[一-龥][^"]*)"/g)) keys.add(m[1]);
// Settings descriptions kept in constants and passed as tr(CONSTANT).
for (const m of readFileSync("src/modules/settings.ts", "utf8").matchAll(/^const [A-Z_]+_DESC = "((?:[^"\\]|\\.)*)"/gm)) keys.add(JSON.parse(`"${m[1]}"`));
// Enhancement labels and reasons, passed as tr(variable).
for (const m of readFileSync("src/modules/enhancement-gate-core.ts", "utf8").matchAll(/(?:\b(?:label|desc|setting|note)|"third-party"): "([^"]+)"/g)) keys.add(m[1]);
// zh("…") marks Chinese kept in module-level data and translated where it is shown.
for (const f of walk("src").filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("i18n")))
  for (const m of readFileSync(f, "utf8").matchAll(/\bzh\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
const table = readFileSync("src/i18n-en.ts", "utf8");
const have = new Set([...table.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map(m => JSON.parse(`"${m[1]}"`)));
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
const entries = [...table.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]);
const mismatched = entries.filter(([zh, en]) => placeholders(zh) !== placeholders(en));
for (const [zh] of mismatched) console.log(`  placeholders differ: ${zh}`);
const missing = [...keys].filter(k => !have.has(k));
const stale = [...have].filter(k => !keys.has(k));
if (process.argv.includes("--list")) console.log(JSON.stringify(missing, null, 1));
else {
  console.log(`${keys.size} tr() keys, ${missing.length} without English, ${stale.length} unused table entries`);
  for (const k of stale) console.log(`  unused: ${k}`);
}
process.exit(missing.length || mismatched.length ? 1 : 0);
