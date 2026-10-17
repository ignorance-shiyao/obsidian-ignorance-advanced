// Device rules must win over the desktop rule they adjust. A phone rule such as
//   body.is-phone .x .y { width: 100% }
// silently loses to a desktop rule `.x .y:not(#_ib):not(#_ib2) { width: … }` with higher specificity,
// which is easy to miss because both rules look right on their own. This check pairs every
// `.is-phone` / `.is-mobile` / `.is-tablet` rule with the plain rules for the same selector, and
// reports a pair whose shared properties the device rule would lose.
//   node scripts/check-cascade.mjs [file.css …]      default: theme-features.css styles.css
// Cascade layers cannot replace this: Obsidian's own app.css is unlayered, and unlayered rules beat
// every layered one, so layering our CSS would make all of it lose to Obsidian.
import { readFileSync } from "node:fs";

const DEVICE = /(?:body)?\.is-(?:phone|mobile|tablet)\b\s*/g;

// Top-level comma split (ignores commas inside parentheses).
function splitList(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

// Specificity [ids, classes, types] of one complex selector, with :is/:not/:has taking their
// most specific argument and :where counting nothing.
function specificity(sel) {
  let a = 0, b = 0, c = 0, i = 0;
  const add = s => { a += s[0]; b += s[1]; c += s[2]; };
  const max = list => list.map(specificity).reduce((m, s) => (cmp(s, m) > 0 ? s : m), [0, 0, 0]);
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === "#") { a++; i++; while (i < sel.length && /[\w-]/.test(sel[i])) i++; }
    else if (ch === ".") { b++; i++; while (i < sel.length && /[\w-]/.test(sel[i])) i++; }
    else if (ch === "[") { b++; i = sel.indexOf("]", i) + 1; }
    else if (ch === ":") {
      const pseudoElement = sel[i + 1] === ":";
      i += pseudoElement ? 2 : 1;
      const name = /^[\w-]+/.exec(sel.slice(i))[0];
      i += name.length;
      let arg = null;
      if (sel[i] === "(") {
        let depth = 1, j = i + 1;
        while (depth) { if (sel[j] === "(") depth++; else if (sel[j] === ")") depth--; j++; }
        arg = sel.slice(i + 1, j - 1);
        i = j;
      }
      if (pseudoElement || ["before", "after", "first-line", "first-letter", "placeholder", "selection"].includes(name)) c++;
      else if (name === "where") { /* zero */ }
      else if (["is", "not", "has", "matches"].includes(name)) add(max(splitList(arg)));
      else if (name === "nth-child" || name === "nth-last-child") { b++; const of = arg && / of (.+)$/.exec(arg); if (of) add(max(splitList(of[1]))); }
      else b++;
    }
    else if (/[a-zA-Z*]/.test(ch)) { const m = /^[\w-]+|^\*/.exec(sel.slice(i))[0]; if (m !== "*") c++; i += m.length; }
    else i++;
  }
  return [a, b, c];
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

// Flat list of style rules with their @media / @supports context and source order.
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const walk = (text, context) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < text.length) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@supports") || head.startsWith("@layer") || head.startsWith("@container")) walk(body, `${context}${head} `);
      else if (!head.startsWith("@")) {
        const props = new Set(body.split(";").map(d => d.split(":")[0].trim().toLowerCase()).filter(Boolean));
        out.push({ selectors: splitList(head), props, context, line: text.slice(0, i).split("\n").length, order: out.length });
      }
      i = j;
    }
  };
  walk(css, "");
  return out;
}

const normalize = sel => sel.replace(/:not\(#_ib\d*\)/g, "").replace(/\s+/g, " ").trim();

// `X :is(A, B)` → `X A`, `X B`, so a device rule written for one branch still meets the desktop rule.
// Only :is() outside other parentheses is expanded; its specificity is kept for every branch.
function expand(sel) {
  let depth = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === "(") depth++;
    else if (sel[i] === ")") depth--;
    else if (depth === 0 && sel.startsWith(":is(", i)) {
      let d = 1, j = i + 4;
      while (d) { if (sel[j] === "(") d++; else if (sel[j] === ")") d--; j++; }
      const branches = splitList(sel.slice(i + 4, j - 1));
      if (branches.length < 2) return [sel];
      return branches.flatMap(branch => expand(sel.slice(0, i) + branch + sel.slice(j)));
    }
  }
  return [sel];
}
// padding and padding-inline-start touch the same property.
const overlaps = (p, q) => p === q || p.startsWith(`${q}-`) || q.startsWith(`${p}-`);

let problems = 0;
for (const file of process.argv.slice(2).length ? process.argv.slice(2) : ["theme-features.css", "styles.css"]) {
  const list = rules(readFileSync(file, "utf8"));
  const plain = new Map();
  for (const rule of list) for (const sel of rule.selectors) {
    if (DEVICE.test(sel)) { DEVICE.lastIndex = 0; continue; }
    DEVICE.lastIndex = 0;
    for (const branch of expand(sel)) {
      const key = normalize(branch);
      if (!plain.has(key)) plain.set(key, []);
      plain.get(key).push({ rule, sel });
    }
  }
  for (const rule of list) for (const sel of rule.selectors) {
    if (!DEVICE.test(sel)) { DEVICE.lastIndex = 0; continue; }
    DEVICE.lastIndex = 0;
    const candidates = new Set(expand(sel.replace(DEVICE, "")).flatMap(branch => plain.get(normalize(branch)) || []));
    DEVICE.lastIndex = 0;
    for (const other of candidates) {
      const shared = [...rule.props].filter(p => [...other.rule.props].some(q => overlaps(p, q)));
      if (!shared.length) continue;
      const mine = specificity(sel), theirs = specificity(other.sel);
      const order = cmp(mine, theirs);
      if (order < 0 || (order === 0 && rule.order < other.rule.order)) {
        problems++;
        console.log(`✘ ${file}: device rule loses (${shared.join(", ")})\n    ${sel}  [${mine}]\n    ${other.sel}  [${theirs}]`);
      }
    }
  }
}
if (problems) { console.log(`\n${problems} device rule(s) lose to the desktop rule they adjust`); process.exitCode = 1; }
else console.log("✔ device rules win over the desktop rules they adjust");
