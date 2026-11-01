import type { IgnorancePlugin } from "../plugin-types.js";
/* A cover block at the top of Reading view, built from the note's properties. Per note: add `ib-cover` to
   `cssclasses` (the inline title is then hidden, the cover shows it). Properties used: title, subtitle or
   description, author, date / created / published, tags. */
export interface CoverFields { title: string; subtitle: string; authors: string[]; date: string; tags: string[] }

const scalar = (value: unknown): string => (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "");

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

function backCoverMeta(frontmatter: Record<string, unknown> | undefined) {
  return [scalar(frontmatter?.copyright), scalar(frontmatter?.rights)].filter(Boolean);
}

/* Back cover: a level-1 heading on the note's last line closes the note as its back cover,
   with the `copyright` and `rights` properties under it. */
function markBackCover(heading: HTMLElement, frontmatter: Record<string, unknown> | undefined) {
  if (heading.classList.contains("ib-back-cover")) return;
  // Classes go on the heading and the lines are siblings: paged reading copies blocks one by one.
  heading.classList.add("ib-back-cover");
  heading.after(...backCoverMeta(frontmatter).map(text => createDiv({ cls: "ib-back-cover__meta", text })));
}

function installBackCover(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    // One section holds one heading; a whole note rendered at once holds them all, the back cover last.
    const headings = element.querySelectorAll<HTMLElement>(":scope > h1, :scope > div > h1");
    const heading = headings[headings.length - 1];
    if (!heading) return;
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    const cache = file ? plugin.app.metadataCache.getFileCache(file) : null;
    const info = context.getSectionInfo?.(element);
    let last: boolean;
    if (info) last = isBackCoverLine(info.text.split("\n"), info.lineStart);
    else {
      // A whole note rendered at once (paged reading, exports) has no section lines: ask the metadata cache.
      const section = cache?.sections?.[cache.sections.length - 1];
      const final = cache?.headings?.[cache.headings.length - 1];
      last = Boolean(section?.type === "heading" && final?.level === 1 && final.position.start.line === section.position.start.line
        && final.heading === (heading.dataset.heading ?? heading.textContent?.trim()));
    }
    if (last) markBackCover(heading, cache?.frontmatter);
  });
}

export function installReadingCover(plugin: IgnorancePlugin) {
  installBackCover(plugin);
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
