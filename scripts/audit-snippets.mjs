import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { connectObsidian } from "./obsidian-cdp.mjs";

export async function sourceModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "esm", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
export async function auditSnippets(evaluate) {
  const { SNIPPET_TEMPLATES, resolveSnippet } = await sourceModule("../src/modules/snippets.ts");
  const snippets = SNIPPET_TEMPLATES.filter(item => item.body.startsWith("```mermaid\n")).map(item => ({
    id: item.id, name: item.name, source: resolveSnippet(item.body).text.replace(/^```mermaid\n/, "").replace(/\n```$/, "")
  }));
  if (!snippets.length) throw Error("No Mermaid templates found");
  return evaluate(`(async()=>{
    await app.plugins.plugins['ignorance-advanced'].ensureMermaid();
    const results=[];
    for(const [index,item] of ${JSON.stringify(snippets)}.entries()){
      const id='ib-snippet-audit-'+Date.now()+'-'+index;
      const host=document.body.createDiv({cls:'ib-snippet-audit'});
      host.style.cssText='position:fixed;left:0;top:0;width:900px;opacity:0;pointer-events:none';
      try{await window.mermaid.parse(item.source);const output=await window.mermaid.render(id,item.source,host);results.push({id:item.id,name:item.name,ok:typeof output.svg==='string'&&output.svg.includes('<svg')});}
      catch(error){results.push({id:item.id,name:item.name,ok:false,error:String(error).slice(0,1200)});}
      finally{host.remove();document.getElementById('d'+id)?.remove();}
    }
    return {total:results.length,failed:results.filter(item=>!item.ok),results};
  })()`);
}
export async function runSnippetAudit() {
  const connection = await connectObsidian();
  try { return await auditSnippets(connection.evaluate); } finally { connection.close(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await runSnippetAudit(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.failed.length ? 1 : 0;
}
