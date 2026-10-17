/* Slide staging for exports: an off-screen, unscaled copy of a slide in the
   main document, so exporting never changes what the user sees. */

function dataUrlOf(source) {
  const canvas = createEl("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  if (!canvas.width || !canvas.height) return "";
  canvas.getContext("2d").drawImage(source, 0, 0);
  try { return canvas.toDataURL("image/png"); } catch (_) { return ""; }
}

/* An off-screen, unscaled copy of one slide in the main document, laid out at
   the canvas size inside the same Reveal / skin classes. Used both to measure
   objects for the editable export and as the surface that gets painted. */
export function stageSlide(root: HTMLElement, section, width: number, height) {
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
  // Canvases lose their pixels when cloned: embed them, and the pictures, as
  // data URLs so the copy paints on its own.
  const sourceCanvases = [...section.querySelectorAll("canvas")];
  [...copy.querySelectorAll("canvas")].forEach((canvas, index) => {
    const img = createEl("img");
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
    remove() { stage.remove(); }
  };
}
