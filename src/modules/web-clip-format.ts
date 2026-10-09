/* Pure helpers of the web clipper (no Obsidian API), kept apart for tests. */
export const CLIP_TAG = "00-剪藏";
export const URL_PATTERN = /https?:\/\/[^\s<>"'）)\]]+/;

export const pad = value => String(value).padStart(2, "0");
export const day = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function isClipUrl(text) {
  const value = String(text || "").trim();
  return /^https?:\/\/\S+$/.test(value) && URL_PATTERN.test(value);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function frontmatter({ title, url, author, published, description }) {
  const lines = ["---", `title: ${yamlString(title)}`, `source: ${yamlString(url)}`];
  if (author) lines.push("author:", `  - ${yamlString(`[[${author}]]`)}`);
  if (published) lines.push(`published: ${published}`);
  lines.push(`created: ${day(new Date())}`);
  if (description) lines.push(`description: ${yamlString(description.replace(/\s+/g, " ").slice(0, 300))}`);
  lines.push("tags:", `  - ${yamlString(CLIP_TAG)}`, "---", "");
  return lines.join("\n");
}

// WeChat styles headings with <strong> and pads lines with &nbsp;.
export function tidyMarkdown(markdown) {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/^(#{1,6}) +\*\*(.+?)\*\* *$/gm, "$1 $2")
    .split("\n").map(line => line.replace(/[ \t]+$/, "").replace(/^ +(?=\S)(?![-*+] |\d+\. )/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

