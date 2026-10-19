// Lists every literal key passed to tr() and reports the ones missing from src/i18n-en.ts.
//   node scripts/i18n-keys.mjs          report only
//   node scripts/i18n-keys.mjs --list   print the missing keys as JSON
import { readFileSync, readdirSync } from "node:fs";
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const keys = new Set();
for (const f of walk("src").filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("i18n")))
  for (const m of readFileSync(f, "utf8").matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
const table = readFileSync("src/i18n-en.ts", "utf8");
const have = new Set([...table.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map(m => JSON.parse(`"${m[1]}"`)));
const missing = [...keys].filter(k => !have.has(k));
const stale = [...have].filter(k => !keys.has(k));
if (process.argv.includes("--list")) console.log(JSON.stringify(missing, null, 1));
else {
  console.log(`${keys.size} tr() keys, ${missing.length} without English, ${stale.length} unused table entries`);
  for (const k of stale) console.log(`  unused: ${k}`);
}
process.exit(missing.length ? 1 : 0);
