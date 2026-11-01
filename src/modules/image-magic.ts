import { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { colorVar } from "./color-code-core.js";
import { enhancementOn } from "./enhancement-gate.js";
import { isImagePath, parseImageMagic, type ImageMagic } from "./image-magic-core.js";
/* Image magic in Reading view and exports (see image-magic-core.ts for the syntax).
   Obsidian keeps an embed's address, `#` and `?` included, in the embed's `src`; an address with `?` is not
   found as a file, so that embed is turned back into the image it names. */

const DONE = "ibImageMagic";

function resolveFile(plugin: IgnorancePlugin, path: string, sourcePath: string) {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep the path as written */ }
  return plugin.app.metadataCache.getFirstLinkpathDest(decoded, sourcePath);
}

/** An embed Obsidian could not find because of the `?…` in its address: show the image it names. */
function repairEmbed(plugin: IgnorancePlugin, embed: HTMLElement, magic: ImageMagic, sourcePath: string) {
  if (!embed.classList.contains("mod-empty-attachment") || !isImagePath(magic.path)) return null;
  const file = resolveFile(plugin, magic.path, sourcePath);
  if (!file) return null;
  embed.empty();
  embed.classList.remove("file-embed", "mod-empty-attachment");
  embed.classList.add("media-embed", "image-embed");
  const alt = embed.getAttribute("alt");
  const img = embed.createEl("img", { attr: { src: plugin.app.vault.getResourcePath(file), loading: "lazy", decoding: "async" } });
  if (alt && alt !== embed.getAttribute("src")) img.alt = alt;
  return img;
}

function darkSource(plugin: IgnorancePlugin, magic: ImageMagic, sourcePath: string, name: string) {
  const light = resolveFile(plugin, magic.path, sourcePath);
  const folder = light?.parent?.path;
  const sibling = folder != null ? plugin.app.vault.getAbstractFileByPath(folder && folder !== "/" ? `${folder}/${name}` : name) : null;
  const file = sibling instanceof TFile ? sibling : resolveFile(plugin, name, sourcePath);
  return file ? plugin.app.vault.getResourcePath(file) : null;
}

function buildPostcard(img: HTMLImageElement, holder: HTMLElement, magic: ImageMagic, title: string | null) {
  const card = createDiv({ cls: `ib-postcard is-${magic.card}${magic.border ? " has-border" : ""}` });
  holder.replaceWith(card);
  card.appendChild(holder);
  const heading = img.alt || "";
  if (!heading && !title) return;
  const text = card.createDiv({ cls: "ib-postcard-text" });
  if (heading) text.createDiv({ cls: "ib-postcard-title", text: heading });
  if (title) text.createDiv({ cls: "ib-postcard-desc", text: title });
}

function apply(plugin: IgnorancePlugin, img: HTMLImageElement, holder: HTMLElement, magic: ImageMagic, sourcePath: string, title: string | null) {
  if (img.dataset[DONE]) return;
  img.dataset[DONE] = "1";
  img.classList.toggle("ib-img-grid-line", magic.grid === "line");
  img.classList.toggle("ib-img-grid-block", magic.grid === "block");
  img.classList.toggle("ib-img-padding", magic.padding);
  if (magic.filter) {
    holder.dataset.ibFilter = magic.filter;
    if (magic.filterHover) holder.dataset.ibFilterHover = "true";
  }
  if (magic.dark && "invert" in magic.dark) holder.dataset.ibFilter = "dark-invert";
  if (magic.dark && "file" in magic.dark) {
    const dark = darkSource(plugin, magic, sourcePath, magic.dark.file);
    if (dark) { img.dataset.ibSrcLight = img.src; img.dataset.ibSrcDark = dark; }
  }
  if (magic.fill) {
    img.classList.add("ib-img-fill");
    img.style.setProperty("--ib-fill-color", magic.fill === "text" ? "currentColor" : colorVar(magic.fill));
    img.style.setProperty("--ib-fill-src", `url("${img.src.replace(/"/g, "%22")}")`);
  }
  if (magic.card) buildPostcard(img, holder, magic, title);
  swapDarkImages(holder);
}

/** Images with a dark-mode file show the one that matches the current mode. */
export function swapDarkImages(root: ParentNode = document) {
  const dark = document.body.classList.contains("theme-dark");
  root.querySelectorAll<HTMLImageElement>("img[data-ib-src-dark]").forEach(img => {
    const want = dark ? img.dataset.ibSrcDark : img.dataset.ibSrcLight;
    if (want && img.src !== want) img.src = want;
  });
}

export function renderImageMagic(plugin: IgnorancePlugin, element: HTMLElement, sourcePath: string) {
  for (const embed of element.querySelectorAll<HTMLElement>(".internal-embed[src]")) {
    const magic = parseImageMagic(embed.getAttribute("src") || "");
    if (!magic) continue;
    const title = embed.getAttribute("title");
    const ready = embed.querySelector("img") || repairEmbed(plugin, embed, magic, sourcePath);
    if (ready) { apply(plugin, ready, embed, magic, sourcePath, title); continue; }
    if (embed.classList.contains("mod-empty-attachment")) continue;
    // Obsidian fills an embed after post-processing: wait for its <img>, or for the "not found" it settles on.
    const observer = new MutationObserver(() => {
      const img = embed.querySelector("img") || repairEmbed(plugin, embed, magic, sourcePath);
      if (!img) return;
      observer.disconnect();
      apply(plugin, img, embed, magic, sourcePath, title);
    });
    observer.observe(embed, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.setTimeout(() => observer.disconnect(), 10000);
  }
  // Remote images keep their address on the <img> itself.
  for (const img of element.querySelectorAll<HTMLImageElement>("img[src]")) {
    if (img.closest(".internal-embed") || img.dataset[DONE]) continue;
    const magic = parseImageMagic(img.getAttribute("src") || "");
    if (magic) apply(plugin, img, img, magic, sourcePath, img.getAttribute("title"));
  }
}

export function installImageMagic(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (enhancementOn(plugin, "images", element, context.frontmatter)) renderImageMagic(plugin, element, context.sourcePath);
  });
  plugin.registerEvent(plugin.app.workspace.on("css-change", () => swapDarkImages()));
}
