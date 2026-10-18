import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import JSZip from "jszip";
import { sourceModule } from "./audit-snippets.mjs";

const readExport = (root, name) => {
  const file = resolve(root, name);
  if (!file.startsWith(resolve(root) + sep)) throw Error("Export path leaves the vault");
  return readFile(file);
};
async function removeExport(evaluate, file) {
  if (!file) return true;
  return evaluate(`(async()=>{const file=app.vault.getAbstractFileByPath(${JSON.stringify(file)});if(file)await app.vault.trash(file,true);return !app.vault.getAbstractFileByPath(${JSON.stringify(file)});})()`);
}
export async function auditWordExport(evaluate, vaultRoot, samplePath) {
  let exported;
  let result = { ok: false };
  try {
    const data = await evaluate(`(async()=>{const p=app.plugins.plugins['ignorance-advanced'],file=app.vault.getAbstractFileByPath(${JSON.stringify(samplePath)});if(!file)throw Error('Missing export sample');const css=getComputedStyle(document.body);return {path:await p.exporters.word(p,file),choice:p.state.wordFont,text:css.getPropertyValue('--font-text'),heading:css.getPropertyValue('--ib-font-heading'),stages:document.querySelectorAll('.ibp-word-mermaid-stage').length};})()`);
    exported = data.path;
    const zip = await JSZip.loadAsync(await readExport(vaultRoot, exported));
    const styles = await zip.file("word/styles.xml").async("string");
    const { wordExportFonts } = await sourceModule("../src/modules/word-font.ts");
    const expected = wordExportFonts(data.choice, data).headingFamily;
    const heading = styles.match(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0] || "";
    const media = Object.keys(zip.files).filter(name => name.startsWith("word/media/") && !zip.files[name].dir).length;
    result = { ok: heading.includes(`w:eastAsia="${expected}"`) && media >= 10 && data.stages === 0, expected, media, stages: data.stages };
  } catch (error) { result.error = String(error); }
  finally { try { result.cleaned = await removeExport(evaluate, exported); } catch (error) { result.cleaned = false; result.cleanupError = String(error); } }
  result.ok = result.ok && result.cleaned;
  return result;
}
export async function auditHtmlExport(evaluate, vaultRoot, samplePath) {
  let exported;
  let result = { ok: false };
  try {
    exported = await evaluate(`(async()=>{const p=app.plugins.plugins['ignorance-advanced'],file=app.vault.getAbstractFileByPath(${JSON.stringify(samplePath)});if(!file)throw Error('Missing export sample');return p.exporters.exportHtml(p,file);})()`);
    const html = (await readExport(vaultRoot, exported)).toString("utf8");
    result = { ok: html.includes("ib-reader") && !/localStorage|sessionStorage/.test(html), reader: html.includes("ib-reader"), browserStorage: /localStorage|sessionStorage/.test(html) };
  } catch (error) { result.error = String(error); }
  finally { try { result.cleaned = await removeExport(evaluate, exported); } catch (error) { result.cleaned = false; result.cleanupError = String(error); } }
  result.ok = result.ok && result.cleaned;
  return result;
}
