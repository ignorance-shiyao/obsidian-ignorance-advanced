/* Pure helpers of the web clipper (no Obsidian API), kept apart for tests. */
export const CLIP_TAG = "Clippings";
export const URL_PATTERN = /https?:\/\/[^\s<>"'）)\]]+/;

export const pad = (value: number) => String(value).padStart(2, "0");
export const day = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function isClipUrl(text: string) {
  const value = String(text || "").trim();
  return /^https?:\/\/\S+$/.test(value) && URL_PATTERN.test(value);
}

function yamlString(value: string) {
  return JSON.stringify(String(value ?? ""));
}

export function frontmatter({ title, url, author, published, description, tag = CLIP_TAG }) {
  const lines = ["---", `title: ${yamlString(title)}`, `source: ${yamlString(url)}`];
  if (author) lines.push("author:", `  - ${yamlString(`[[${author}]]`)}`);
  if (published) lines.push(`published: ${published}`);
  lines.push(`created: ${day(new Date())}`);
  if (description) lines.push(`description: ${yamlString(description.replace(/\s+/g, " ").slice(0, 300))}`);
  lines.push("tags:", `  - ${yamlString(tag)}`, "---", "");
  return lines.join("\n");
}

// WeChat styles headings with <strong> and pads lines with &nbsp;.
export function tidyMarkdown(markdown) {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/^(#{1,6}) +\*\*(.+?)\*\* *$/gm, "$1 $2")
    .split("\n").map((line: number) => line.replace(/[ \t]+$/, "").replace(/^ +(?=\S)(?![-*+] |\d+\. )/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

