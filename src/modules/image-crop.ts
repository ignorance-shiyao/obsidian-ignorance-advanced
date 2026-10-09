// Crop a vault image: drag a box over it, then choose to replace the original file or add the crop
// as a new image. Raster formats only (png, jpg, webp); the output keeps the original's format.
const { Modal, Notice, TFile } = require("obsidian");

const OUTPUT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as const;
const RATIOS: Array<[string, number]> = [["自由", 0], ["1:1", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9], ["3:4", 3 / 4], ["9:16", 9 / 16]];

export function canCrop(file) { return file instanceof TFile && Object.keys(OUTPUT).includes(file.extension.toLowerCase()); }

import { adjustBox, fitBoxToRatio, type Box } from "./crop-geometry.js";

const unique = (plugin, folder: string, base: string, ext: string) =>
  plugin.app.vault.getAvailablePath(`${folder ? folder + "/" : ""}${base}`, ext);

export async function cropImage(plugin, file, onDone: (result: { mode: "replace" | "new"; file: any }) => void) {
  const ext = file.extension.toLowerCase();
  const mime = OUTPUT[ext];
  if (!mime) { new Notice("暂不支持裁切这种格式（支持 PNG、JPG、WebP）"); return; }
  const source = await plugin.app.vault.readBinary(file);
  const url = URL.createObjectURL(new Blob([source], { type: mime }));
  const modal = new Modal(plugin.app);
  modal.containerEl.addClass("ib-crop-modal");
  modal.titleEl.setText("裁切图片");
  const stage = modal.contentEl.createDiv({ cls: "ib-crop-stage" });
  const img = stage.createEl("img", { cls: "ib-crop-image", attr: { src: url, draggable: "false" } });
  const toolbar = modal.contentEl.createDiv({ cls: "ib-crop-bar" });
  const readout = toolbar.createSpan({ cls: "ib-crop-readout" });
  const ratios = toolbar.createDiv({ cls: "ib-crop-ratios" });
  const actions = modal.contentEl.createDiv({ cls: "modal-button-container" });
  const done = actions.createEl("button", { text: "裁切", cls: "mod-cta" });
  const cancel = actions.createEl("button", { text: "取消" });
  let natural = { w: 0, h: 0 }, box: Box = { x: 0, y: 0, w: 0, h: 0 }, ratio = 0;
  const frame = stage.createDiv({ cls: "ib-crop-box" });
  for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) frame.createDiv({ cls: `ib-crop-handle is-${dir}`, attr: { "data-dir": dir } });
  const scale = () => img.clientWidth / natural.w;
  const paint = () => {
    const k = scale();
    Object.assign(frame.style, { left: `${box.x * k}px`, top: `${box.y * k}px`, width: `${box.w * k}px`, height: `${box.h * k}px` });
    readout.setText(`${Math.round(box.w)} × ${Math.round(box.h)} 像素`);
  };
  const ready = () => {
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    box = { x: natural.w * 0.1, y: natural.h * 0.1, w: natural.w * 0.8, h: natural.h * 0.8 };
    paint();
  };
  if (img.complete && img.naturalWidth) ready(); else img.addEventListener("load", ready);
  for (const [label, value] of RATIOS) {
    const chip = ratios.createEl("button", { text: label, cls: "ib-crop-ratio" });
    if (!value) chip.addClass("is-active");
    chip.addEventListener("click", () => {
      ratio = value;
      ratios.querySelectorAll(".ib-crop-ratio").forEach(node => node.removeClass("is-active"));
      chip.addClass("is-active");
      box = fitBoxToRatio(box, ratio, natural);
      paint();
    });
  }
  frame.addEventListener("pointerdown", event => {
    event.preventDefault();
    const handle = (event.target as HTMLElement).dataset?.dir || "move";
    const startX = event.clientX, startY = event.clientY, start = { ...box }, k = scale();
    frame.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => { box = adjustBox(start, handle, (e.clientX - startX) / k, (e.clientY - startY) / k, natural, ratio); paint(); };
    const up = () => { frame.removeEventListener("pointermove", move); frame.removeEventListener("pointerup", up); };
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", up);
  });
  modal.scope.register([], "Enter", () => { done.click(); return false; });

  const crop = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(box.w)); canvas.height = Math.max(1, Math.round(box.h));
    canvas.getContext("2d")!.drawImage(img, Math.round(box.x), Math.round(box.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92));
    if (!blob) { new Notice("裁切失败"); return; }
    modal.close();
    confirmCrop(plugin, file, canvas, await blob.arrayBuffer(), onDone);
  };
  done.addEventListener("click", crop);
  cancel.addEventListener("click", () => modal.close());
  modal.onClose = () => URL.revokeObjectURL(url);
  modal.open();
}

// After cropping: replace the original file, or keep it and add the crop as a new image.
function confirmCrop(plugin, file, canvas: HTMLCanvasElement, data: ArrayBuffer, onDone) {
  const refs = Object.values(plugin.app.metadataCache.resolvedLinks as Record<string, Record<string, number>>)
    .filter(links => links[file.path]).length;
  const modal = new Modal(plugin.app);
  modal.titleEl.setText("应用裁切");
  const preview = modal.contentEl.createDiv({ cls: "ib-crop-confirm" });
  const thumb = preview.createEl("img", { cls: "ib-crop-thumb", attr: { src: canvas.toDataURL() } });
  thumb.alt = "裁切结果";
  preview.createDiv({ cls: "ib-crop-confirm-text" }).setText(`裁切结果 ${canvas.width} × ${canvas.height} 像素，${(data.byteLength / 1024).toFixed(0)} KB。`);
  modal.contentEl.createEl("p", { text: `替换原图：覆盖「${file.name}」${refs > 1 ? `，另有 ${refs - 1} 篇笔记引用它，也会一起变化` : ""}。` });
  modal.contentEl.createEl("p", { text: "新增图片：另存为新文件，当前位置改用新图片，原图保留。" });
  const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
  buttons.createEl("button", { text: "替换原图", cls: "mod-warning" }).addEventListener("click", async () => {
    modal.close();
    try { await plugin.app.vault.modifyBinary(file, data); onDone({ mode: "replace", file }); new Notice("已替换原图"); }
    catch (error) { new Notice(`替换失败：${error?.message || error}`); }
  });
  const addNew = buttons.createEl("button", { text: "新增图片", cls: "mod-cta" });
  addNew.addEventListener("click", async () => {
    modal.close();
    try {
      const path = unique(plugin, file.parent?.path === "/" ? "" : file.parent?.path || "", `${file.basename}-裁切`, file.extension);
      const created = await plugin.app.vault.createBinary(path, data);
      onDone({ mode: "new", file: created });
      new Notice(`已新增图片：${created.name}`);
    } catch (error) { new Notice(`新增失败：${error?.message || error}`); }
  });
  buttons.createEl("button", { text: "取消" }).addEventListener("click", () => modal.close());
  modal.open();
  // Enter should take the safe choice, not overwrite the original.
  window.setTimeout(() => addNew.focus(), 0);
}
