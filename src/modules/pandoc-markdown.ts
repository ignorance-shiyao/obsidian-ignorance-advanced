export type ResolveLocalImage = (target: string) => Promise<string> | string;

export async function prepareMarkdownTextForPandoc(text: string, diagrams: string[], resolveLocalImage: ResolveLocalImage) {
  let mermaidIndex = 0;
  text = text.replace(/```mermaid\n[\s\S]*?```/g, whole => {
    const png = diagrams[mermaidIndex++];
    return png ? `![](${png.replace(/\\/g, "/")})` : whole;
  });
  const embeds = [...text.matchAll(/!\[\[([^\]]+)\]\]/g)];
  for (const match of embeds) text = text.replace(match[0], `![](<${await resolveLocalImage(match[1])}>)`);
  const images = [...text.matchAll(/!\[([^\]]*)\]\((?!https?:|data:)<?([^)>]+)>?\)/g)];
  for (const match of images) {
    if (match[2].startsWith("/") || /^[A-Za-z]:[\\/]/.test(match[2])) continue;
    text = text.replace(match[0], `![${match[1]}](<${await resolveLocalImage(match[2])}>)`);
  }
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, (_, target) => target.split("#").pop());
  text = text.replace(/^(\s*>+\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_, quote, type, title) => `${quote}**${title || type.charAt(0).toUpperCase() + type.slice(1)}**`);
  text = text.replace(/%%[\s\S]*?%%/g, "");
  return text;
}
