import type { IgnorancePlugin } from "../plugin-types.js";
/* A cover block at the top of Reading view, built from the note's properties. Per note: add `ib-cover` to
   `cssclasses` (the inline title is then hidden, the cover shows it). Properties used: title, subtitle or
   description, author, date / created / published, tags. */
export interface CoverFields { title: string; subtitle: string; authors: string[]; date: string; tags: string[] }

const list = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : [])
  .map(item => String(item).replace(/^\[\[|\]\]$/g, "").trim()).filter(Boolean);

const dateText = (value: unknown) => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
};

export function coverFields(frontmatter: Record<string, any> | undefined, basename: string): CoverFields {
  const properties = frontmatter || {};
  return {
    title: String(properties.title || basename),
    subtitle: String(properties.subtitle || properties.description || ""),
    authors: list(properties.author),
    date: dateText(properties.date || properties.created || properties.published),
    tags: list(properties.tags).map(tag => tag.replace(/^#/, ""))
  };
}

export function installReadingCover(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    const info = context.getSectionInfo?.(element);
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!info || !file) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    const classes = [cache?.frontmatter?.cssclasses, cache?.frontmatter?.cssclass].flat().filter(Boolean).map(String);
    if (!classes.includes("ib-cover")) return;
    // Only the first real section carries the cover.
    const first = (cache?.sections || []).find(section => section.type !== "yaml");
    if (!first || info.lineStart !== first.position.start.line || element.querySelector(".ib-cover-block")) return;
    const fields = coverFields(cache.frontmatter, file.basename);
    const cover = createDiv({ cls: "ib-cover-block" });
    cover.createEl("h1", { cls: "ib-cover-block__title", text: fields.title });
    if (fields.subtitle) cover.createDiv({ cls: "ib-cover-block__subtitle", text: fields.subtitle });
    const meta = [fields.authors.join("、"), fields.date].filter(Boolean).join(" · ");
    if (meta) cover.createDiv({ cls: "ib-cover-block__meta", text: meta });
    if (fields.tags.length) {
      const tags = cover.createDiv({ cls: "ib-cover-block__tags" });
      for (const tag of fields.tags) tags.createSpan({ cls: "ib-cover-block__tag", text: tag });
    }
    element.prepend(cover);
  });
}
