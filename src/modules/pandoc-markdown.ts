export type ResolveLocalImage = (target: string) => Promise<string> | string;

const CODE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)|`[^`\n]+`/g;

// Rewrites only outside fenced and inline code, so examples of the syntax stay as written.
async function outsideCode(text: string, rewrite: (part: string) => Promise<string>) {
  let result = "", last = 0;
  for (const match of text.matchAll(CODE)) {
    const start = match.index ?? 0;
    result += await rewrite(text.slice(last, start)) + match[0];
    last = start + match[0].length;
  }
  return result + await rewrite(text.slice(last));
}

function htmlAttribute(tag: string, name: string) {
  return new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find(value => value !== undefined) ?? "";
}

export async function prepareMarkdownTextForPandoc(text: string, diagrams: string[], resolveLocalImage: ResolveLocalImage) {
  let mermaidIndex = 0;
  text = text.replace(/```mermaid\n[\s\S]*?```/g, whole => {
    const png = diagrams[mermaidIndex++];
    return png ? `![](${png.replace(/\\/g, "/")})` : whole;
  });
  return outsideCode(text, async part => {
    // HTML <img> tags become Markdown images so the converter sees them.
    part = part.replace(/<img\b[^>]*>/gi, tag => {
      const src = htmlAttribute(tag, "src");
      return src ? `![${htmlAttribute(tag, "alt").replace(/[[\]]/g, "")}](<${src}>)` : tag;
    });
    for (const match of [...part.matchAll(/!\[\[([^\]]+)\]\]/g)]) {
      const resolved = `![](<${await resolveLocalImage(match[1])}>)`;
      part = part.replace(match[0], () => resolved);
    }
    for (const match of [...part.matchAll(/!\[([^\]]*)\]\((?!<?(?:https?:|data:))<?([^)>]+)>?\)/g)]) {
      if (match[2].startsWith("/") || /^[A-Za-z]:[\\/]/.test(match[2])) continue;
      // A title after the path (x.png "Title") is not part of the file name.
      const target = match[2].replace(/\s+(?:"[^"]*"|'[^']*')\s*$/, "");
      const resolved = `![${match[1]}](<${await resolveLocalImage(target)}>)`;
      part = part.replace(match[0], () => resolved);
    }
    part = part.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, (_: string, target: string) => target.split("#").pop() ?? target);
    part = part.replace(/^(\s*>+\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_: string, quote: string, type: string, title: string) => `${quote}**${title || type.charAt(0).toUpperCase() + type.slice(1)}**`);
    return part.replace(/%%[\s\S]*?%%/g, "");
  });
}
