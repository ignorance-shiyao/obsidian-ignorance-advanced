/* Click-to-play GIFs: write `click` in the alt text (![click|400](a.gif)). The image shows its first frame with a play
   badge and starts animating when clicked; click again to stop. The first frame is decoded from the file itself,
   so it works without touching the network. Exports keep the still frame. */
const wantsClick = (alt: string) => alt.split("|").some(part => part.trim().toLowerCase() === "click");

export function installGifClick(plugin) {
  plugin.registerMarkdownPostProcessor(async (element, context) => {
    for (const holder of element.querySelectorAll(".internal-embed")) {
      const src = holder.getAttribute("src") || "";
      if (holder.dataset.ibGifDone || !/\.gif$/i.test(src.split("#")[0]) || !wantsClick(holder.getAttribute("alt") || "")) continue;
      holder.dataset.ibGifDone = "1";
      const file = plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(src.split("#")[0]), context.sourcePath);
      if (!file) continue;
      void arm(plugin, holder, file);
    }
  });
}

async function firstFrame(plugin, file) {
  const bytes = await plugin.app.vault.readBinary(file);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/gif" }));
  const canvas = createEl("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas.toDataURL("image/png");
}

async function arm(plugin, holder: Element, file) {
  let poster = "";
  try { poster = await firstFrame(plugin, file); } catch (_) { return; }
  // The <img> appears inside the placeholder a moment after post-processing.
  for (let tries = 0; tries < 60 && !holder.querySelector("img"); tries += 1) await new Promise(resolve => window.requestAnimationFrame(resolve));
  const image = holder.querySelector("img");
  if (!image) return;
  const animated = image.src;
  image.src = poster;
  holder.classList.add("ib-gif-click");
  holder.setAttribute("role", "button");
  holder.setAttribute("aria-label", "点击播放或停止");
  holder.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const playing = holder.classList.toggle("is-playing");
    image.src = playing ? animated : poster;
  });
}
