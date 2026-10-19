/* A source card is an ordinary callout, so it exports and prints like any other text:
     > [!source] Title
     > Description
     > [site](https://…)
   Without a title (offline, blocked page) it falls back to a plain Markdown link. */
export interface SourceInfo { title: string; description: string; site: string; url: string }

const oneLine = (text: string, max = 200) => text.replace(/\s+/g, " ").replace(/[[\]]/g, m => `\\${m}`).trim().slice(0, max);

export function sourceCardMarkdown(info: SourceInfo): string {
  const title = oneLine(info.title, 120);
  const link = `[${oneLine(info.site || new URL(info.url).hostname.replace(/^www\./, ""), 60)}](${info.url})`;
  if (!title) return `[${link.slice(1, link.indexOf("]("))}](${info.url})`;
  const lines = [`> [!source] ${title}`];
  const description = oneLine(info.description);
  if (description) lines.push(`> ${description}`);
  lines.push(`> ${link}`);
  return lines.join("\n");
}

const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_m, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" })[name] ?? "");

// Plain pattern matching, so it needs no DOM and a malformed page cannot throw.
export function readSourceInfo(html: string, url: string): SourceInfo {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const attribute = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find(value => value !== undefined);
  const meta = (...names: string[]) => {
    for (const name of names) {
      for (const tag of tags) {
        const key = attribute(tag, "property") ?? attribute(tag, "name");
        const content = attribute(tag, "content")?.trim();
        if (key?.toLowerCase() === name && content) return decode(content);
      }
    }
    return "";
  };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  return { title: meta("og:title", "twitter:title") || decode(title.trim()), description: meta("og:description", "description", "twitter:description"), site: meta("og:site_name"), url };
}
