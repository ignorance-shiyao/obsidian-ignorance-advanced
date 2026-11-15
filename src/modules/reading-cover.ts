/* A cover block at the top of Reading view, built from the note's properties. Per note: add `ib-cover` to
   `cssclasses` (the inline title is then hidden, the cover shows it). Properties used: title, subtitle or
   description, author, date / created / published, tags. */
export interface CoverFields { title: string; subtitle: string; authors: string[]; date: string; tags: string[] }

export const scalar = (value: unknown): string => (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "");

const list = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : [])
  .map(item => scalar(item).replace(/^\[\[|\]\]$/g, "").trim()).filter(Boolean);

const dateText = (value: unknown) => {
  const text = value instanceof Date ? value.toISOString() : scalar(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
};

export function coverFields(frontmatter: Record<string, unknown> | undefined, basename: string): CoverFields {
  const properties = frontmatter || {};
  return {
    title: scalar(properties.title) || basename,
    subtitle: scalar(properties.subtitle) || scalar(properties.description),
    authors: list(properties.author),
    date: dateText(properties.date || properties.created || properties.published),
    tags: list(properties.tags).map(tag => tag.replace(/^#/, ""))
  };
}

/** True when `line` holds the note's last non-empty line and that line is a level-1 heading. */
export function isBackCoverLine(lines: string[], line: number) {
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  return last === line && /^# \S/.test(lines[line]);
}

/** Whether a note asks for a cover (`ib-cover` in cssclasses). */
export function wantsCover(frontmatter: Record<string, unknown> | undefined): boolean {
  return [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String).includes("ib-cover");
}

export function buildCover(fields: CoverFields): HTMLElement {
  const cover = createDiv({ cls: "ib-cover-block" });
  cover.createEl("h1", { cls: "ib-cover-block__title", text: fields.title });
  if (fields.subtitle) cover.createDiv({ cls: "ib-cover-block__subtitle", text: fields.subtitle });
  const meta = [fields.authors.join("、"), fields.date].filter(Boolean).join(" · ");
  if (meta) cover.createDiv({ cls: "ib-cover-block__meta", text: meta });
  if (fields.tags.length) {
    const tags = cover.createDiv({ cls: "ib-cover-block__tags" });
    for (const tag of fields.tags) tags.createSpan({ cls: "ib-cover-block__tag", text: tag });
  }
  return cover;
}
