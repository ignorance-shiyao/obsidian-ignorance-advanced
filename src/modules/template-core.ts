/* User note templates: Markdown files in a folder the user chooses, with a few fixed variables. Anything
   else, including Templater's `<% … %>`, is left exactly as written, so Templater can run after this. Pure. */

export interface TemplateContext { title: string; author: string; now: Date }

const pad = (value: number) => String(value).padStart(2, "0");

/** Formats with the tokens YYYY, MM, DD, HH, mm, ss; any other character stays as it is. */
export function formatDate(date: Date, format: string): string {
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, token => ({
    YYYY: String(date.getFullYear()), MM: pad(date.getMonth() + 1), DD: pad(date.getDate()),
    HH: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds())
  })[token] ?? token);
}

/** The variables a template may use: {{title}} {{author}} {{date}} {{time}} {{datetime}}; `{{date:YYYY年M…}}` takes a format. */
export function fillTemplate(text: string, context: TemplateContext): string {
  return text.replace(/\{\{\s*(title|author|date|time|datetime)\s*(?::([^}]*))?\}\}/g, (whole, name: string, format?: string) => {
    switch (name) {
      case "title": return context.title;
      case "author": return context.author;
      case "date": return formatDate(context.now, (format ?? "YYYY-MM-DD").trim() || "YYYY-MM-DD");
      case "time": return formatDate(context.now, (format ?? "HH:mm").trim() || "HH:mm");
      case "datetime": return formatDate(context.now, (format ?? "YYYY-MM-DD HH:mm").trim() || "YYYY-MM-DD HH:mm");
      default: return whole;
    }
  });
}

/** A file name safe on every system, from a title. */
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120);
  return cleaned || "未命名";
}

/** The layout a template names in its front matter (`ib-layout: 周报`), if any. */
export function templateLayoutName(text: string): string | null {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const line = head?.split(/\r?\n/).find(item => /^ib-layout\s*:/.test(item));
  const value = line?.replace(/^ib-layout\s*:\s*/, "").trim().replace(/^["']|["']$/g, "");
  return value || null;
}

/** Drops the `ib-layout` line from the front matter (it belongs to the template, not to the new note). */
export function stripTemplateLayout(text: string): string {
  return text.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (whole, head: string) => `---\n${head.split(/\r?\n/).filter(line => !/^ib-layout\s*:/.test(line)).join("\n")}\n---`);
}

export interface TemplatePack { ibpTemplateVersion: 1; templates: { name: string; content: string }[]; layouts: unknown[] }
export const TEMPLATE_PACK_VERSION = 1;

export function buildPack(templates: { name: string; content: string }[], layouts: unknown[]): string {
  const pack: TemplatePack = { ibpTemplateVersion: 1, templates, layouts };
  return JSON.stringify(pack, null, 2);
}

/** Reads a pack; returns what to add and what it would collide with. Existing templates are never overwritten. */
export function readPack(text: string, existingNames: string[]): { add: { name: string; content: string }[]; renamed: string[]; layouts: unknown[]; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { add: [], renamed: [], layouts: [], error: "文件不是有效的 JSON" }; }
  if (typeof data !== "object" || data === null || !Array.isArray((data as TemplatePack).templates)) return { add: [], renamed: [], layouts: [], error: "文件里没有模板" };
  const pack = data as Partial<TemplatePack>;
  if (typeof pack.ibpTemplateVersion !== "number" || pack.ibpTemplateVersion > TEMPLATE_PACK_VERSION) return { add: [], renamed: [], layouts: [], error: "模板包的版本比当前插件新，请先更新插件" };
  const taken = new Set(existingNames);
  const add: { name: string; content: string }[] = [], renamed: string[] = [];
  for (const item of pack.templates ?? []) {
    if (typeof item?.name !== "string" || typeof item.content !== "string" || !item.name.trim()) continue;
    const base = safeFileName(item.name.replace(/\.md$/i, ""));
    let name = base;
    for (let index = 2; taken.has(name); index += 1) name = `${base} ${index}`;
    if (name !== base) renamed.push(`${base} → ${name}`);
    taken.add(name);
    add.push({ name, content: item.content });
  }
  return { add, renamed, layouts: Array.isArray(pack.layouts) ? pack.layouts : [] };
}
