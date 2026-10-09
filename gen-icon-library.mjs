// Builds the plugin's icon files from Material Icon Theme (MIT):
//   language-icons.json  icons for code languages (picker, code headers)
//   file-icons.json      icons for file types (file explorer)
// Each file holds { icons: name -> inner svg, vb: name -> viewBox (when not 24), light: name -> light
// variant, plus the lookup tables }. Ids inside an icon are prefixed so inlined icons never collide.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, "node_modules/material-icon-theme");
const manifest = JSON.parse(await readFile(path.join(pkg, "dist/material-icons.json"), "utf8"));
const list = JSON.parse(await readFile(path.join(here, "src/modules/language-list.json"), "utf8"));
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const light = manifest.light;

async function load(name) {
  let svg;
  try { svg = await readFile(path.join(pkg, "icons", `${name}.svg`), "utf8"); } catch (_) { return null; }
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] || "0 0 24 24";
  const root = /<svg([^>]*)>/.exec(svg)?.[1] || "";
  let body = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  // The root's own fill (usually "none") is lost when only the inner markup is kept.
  const rootFill = /\sfill="([^"]+)"/.exec(root)?.[1];
  if (rootFill) body = `<g fill="${rootFill}">${body}</g>`;
  const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const id of ids) {
    const e = escapeRegExp(id);
    body = body.replace(new RegExp(`id="${e}"`, "g"), `id="${name}-${id}"`)
      .replace(new RegExp(`url\\(#${e}\\)`, "g"), `url(#${name}-${id})`)
      .replace(new RegExp(`href="#${e}"`, "g"), `href="#${name}-${id}"`);
  }
  return { viewBox, body: body.replace(/\s{2,}/g, " ") };
}

async function pack(names, tables, target, recolor = new Set()) {
  const wanted = new Set(names);
  const lightOf = {};
  for (const name of [...wanted]) {
    // A light variant is registered under the same table key; map icon -> its light icon.
    for (const [table, lightTable] of Object.entries(tables.lightTables)) {
      for (const [key, icon] of Object.entries(tables[table])) if (icon === name && lightTable[key]) { lightOf[name] = lightTable[key]; wanted.add(lightTable[key]); }
    }
  }
  const icons = {}, vb = {};
  for (const name of wanted) {
    const data = await load(name);
    if (!data) continue;
    // Folder bodies take the theme's colour: the base grey becomes currentColor.
    icons[name] = recolor.has(name) ? data.body.replace(/#90a4ae/gi, "currentColor") : data.body;
    if (data.viewBox !== "0 0 24 24") vb[name] = data.viewBox;
  }
  const out = { icons, vb, light: lightOf, ...tables.out };
  await writeFile(target, JSON.stringify(out));
  console.log(`${path.basename(target)}: ${Object.keys(icons).length} icons, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

// ---- languages: every id/alias of our own list plus Material's language ids.
const lang = {};
const resolve = key => manifest.languageIds[key] || manifest.fileExtensions[key] || manifest.fileNames[key] || null;
for (const [id, , ...aliases] of list) {
  for (const key of [id, ...aliases]) { const icon = resolve(key.toLowerCase()); if (icon && !lang[key.toLowerCase()]) lang[key.toLowerCase()] = icon; }
}
// a few names Material files under another word
for (const [key, via] of Object.entries({ shell: "sh", bash: "sh", objc: "m", csharp: "cs", cpp: "cpp", terminal: "sh", console: "sh", dockerfile: "dockerfile", makefile: "makefile", plain: "txt", text: "txt", "": "txt" })) {
  const icon = resolve(via); if (icon) lang[key] = icon;
}
// An id Material does not know by that word borrows its first alias' icon, or an icon of the same name.
const iconNames = new Set(Object.values(manifest.iconDefinitions).map(def => path.basename(def.iconPath, ".svg")));
for (const [id, , ...aliases] of list) {
  if (!id || lang[id]) continue;
  const via = aliases.map(alias => lang[alias.toLowerCase()]).find(Boolean);
  if (via) lang[id] = via;
  else if (iconNames.has(id)) lang[id] = id;
}
for (const [id, icon] of Object.entries(manifest.languageIds)) if (!lang[id]) lang[id] = icon;
const langLight = {};
for (const key of Object.keys(lang)) { const l = light.languageIds?.[key] || light.fileExtensions?.[key]; if (l) langLight[key] = l; }
await pack(Object.values(lang), { lang, lightTables: { lang: langLight }, out: { lang } }, process.argv[2]);

// ---- file types: extensions and well-known file names.
const names = { ...manifest.fileNames };
const ext = { ...manifest.fileExtensions };
// Obsidian's own file types have no Material entry; borrow the closest icons.
const fileLight = { ...(light.fileExtensions || {}) };
for (const [key, icon] of Object.entries({ "excalidraw.md": "excalidraw", excalidraw: "excalidraw", canvas: "drawio", base: "database" })) {
  ext[key] = icon;
  if (iconNames.has(`${icon}_light`)) fileLight[key] = `${icon}_light`; else delete fileLight[key];
}
// Folders all share one themed shape (open / closed), so the file tree follows the theme colour.
await pack([...Object.values(ext), ...Object.values(names), manifest.file, manifest.folder, manifest.folderExpanded], {
  ext, names, lightTables: { ext: fileLight, names: light.fileNames || {} },
  out: { ext, names, file: manifest.file, folder: manifest.folder, folderOpen: manifest.folderExpanded }
}, process.argv[3], new Set([manifest.folder, manifest.folderExpanded]));
