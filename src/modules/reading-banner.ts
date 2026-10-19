import type { IgnorancePlugin } from "../plugin-types.js";
/* A banner image at the top of Reading view. Per note: add `ib-banner` to `cssclasses` and a `banner` property
   holding a vault image (`[[cover.png]]` or `cover.png`) or an https address. Missing images leave no empty box. */
export function bannerTarget(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.replace(/^!?\[\[|\]\]$/g, "").split("|")[0].trim();
}

export const isRemote = (target: string) => /^https?:\/\//i.test(target);

export function installReadingBanner(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    const info = context.getSectionInfo?.(element);
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!info || !file) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    const properties = cache?.frontmatter;
    const classes = [properties?.cssclasses, properties?.cssclass].flat().filter(Boolean).map(String);
    if (!classes.includes("ib-banner")) return;
    const first = (cache?.sections || []).find(section => section.type !== "yaml");
    if (!first || info.lineStart !== first.position.start.line || element.querySelector(".ib-banner-block")) return;
    const target = bannerTarget(properties?.banner);
    if (!target) return;
    let source = target;
    if (!isRemote(target)) {
      const image = plugin.app.metadataCache.getFirstLinkpathDest(target, file.path);
      if (!image) return;
      source = plugin.app.vault.getResourcePath(image);
    }
    const banner = createDiv({ cls: "ib-banner-block" });
    const picture = banner.createEl("img", { attr: { src: source, alt: "" } });
    picture.addEventListener("error", () => banner.remove());
    element.prepend(banner);
  });
}
