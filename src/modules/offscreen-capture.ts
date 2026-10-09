/* Background slide capture: a hidden offscreen Electron window renders a copy
   of each slide with the app's stylesheets, so exporting never changes what
   the user sees. The hidden page cannot load Obsidian's app:// resources, so
   images and canvases are embedded as data URLs before a slide is sent. */
import { electronRemote } from "./desktop-runtime.js";

function collectCss() {
  const parts = [];
  for (const sheet of document.styleSheets) {
    try { parts.push([...sheet.cssRules].map(rule => rule.cssText).join("\n")); } catch (_) { /* cross-origin sheet */ }
  }
  return parts.join("\n");
}

export async function openOffscreenCapturer(width, height) {
  const remote = electronRemote();
  if (!remote?.BrowserWindow) throw new Error("当前环境不支持后台渲染");
  // Match the main window's viewport so vw / vh based sizes lay out the same.
  const viewW = Math.max(width, window.innerWidth), viewH = Math.max(height, window.innerHeight);
  const win = new remote.BrowserWindow({
    show: false, width: viewW, height: viewH, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, javascript: true }
  });
  win.webContents.setFrameRate?.(30);
  await win.loadURL("about:blank");
  const setup = {
    css: collectCss(),
    htmlClass: document.documentElement.className,
    htmlStyle: document.documentElement.getAttribute("style") || "",
    bodyClass: document.body.className,
    bodyStyle: document.body.getAttribute("style") || ""
  };
  await win.webContents.executeJavaScript(`(() => {
    const s = ${JSON.stringify(setup)};
    const style = document.createElement("style");
    style.textContent = s.css + "\\nhtml, body { margin: 0 !important; overflow: hidden !important; background: transparent !important; }";
    document.head.appendChild(style);
    document.documentElement.className = s.htmlClass;
    document.documentElement.setAttribute("style", s.htmlStyle);
    document.body.className = s.bodyClass;
    document.body.setAttribute("style", s.bodyStyle);
    return true;
  })()`);
  return {
    async capture(html) {
      await win.webContents.executeJavaScript(`(async () => {
        document.body.innerHTML = ${JSON.stringify(html)};
        await Promise.all([...document.images].map(img => img.decode().catch(() => null)));
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return true;
      })()`);
      const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
      return Buffer.from(image.toPNG());
    },
    close() { if (!win.isDestroyed()) win.destroy(); }
  };
}

function dataUrlOf(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  if (!canvas.width || !canvas.height) return "";
  canvas.getContext("2d").drawImage(source, 0, 0);
  try { return canvas.toDataURL("image/png"); } catch (_) { return ""; }
}

/* An off-screen, unscaled copy of one slide in the main document, laid out at
   the canvas size inside the same Reveal / skin classes. Used both to measure
   objects for the editable export and as the markup sent to the capturer. */
export function stageSlide(root, section, width, height) {
  const stage = document.body.createDiv({ cls: `${root.className} ibp-export-stage ibp-pptx-exporting` });
  stage.setAttribute("style", `${root.getAttribute("style") || ""};position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;`);
  const slides = stage.createDiv({ cls: "slides" });
  slides.setAttribute("style", `position:absolute;inset:0;width:${width}px;height:${height}px;transform:none;`);
  const copy = section.cloneNode(true);
  copy.classList.remove("past", "future", "stack");
  copy.classList.add("present");
  copy.removeAttribute("hidden");
  copy.setAttribute("style", `${section.getAttribute("style") || ""};position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform:none;display:block;opacity:1;visibility:visible;`);
  slides.appendChild(copy);
  // Canvases lose their pixels when cloned, and app:// images cannot load in
  // the capture window: embed both as data URLs.
  const sourceCanvases = [...section.querySelectorAll("canvas")];
  [...copy.querySelectorAll("canvas")].forEach((canvas, index) => {
    const img = document.createElement("img");
    img.src = dataUrlOf(sourceCanvases[index]);
    img.setAttribute("style", canvas.getAttribute("style") || "");
    img.style.width = `${sourceCanvases[index].clientWidth}px`;
    img.style.height = `${sourceCanvases[index].clientHeight}px`;
    canvas.replaceWith(img);
  });
  const sourceImages = [...section.querySelectorAll("img")];
  [...copy.querySelectorAll("img")].forEach((img, index) => {
    const source = sourceImages[index];
    if (source?.complete && source.naturalWidth && !img.src.startsWith("data:")) {
      const data = dataUrlOf(source);
      if (data) img.src = data;
    }
  });
  return {
    stage,
    surface: copy,
    // Markup for the capture window: same stage, placed at the origin.
    html() {
      const left = stage.style.left;
      stage.style.left = "0px";
      const markup = stage.outerHTML;
      stage.style.left = left;
      return markup;
    },
    remove() { stage.remove(); }
  };
}
