import { Platform } from "obsidian";
import { canShrink, pickSmaller, SHRINK_QUALITY } from "./image-shrink-core.js";

/** Bytes of a picture ready to embed: re-encoded to WebP when that is smaller, otherwise untouched. */
export async function embedBytes(bytes: ArrayBuffer, mime: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const original = new Blob([bytes], { type: mime });
  try {
    if (Platform.isMobile || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") throw new Error("unsupported");
    const bitmap = await createImageBitmap(original);
    try {
      if (!canShrink(mime, bitmap.width, bitmap.height, Platform.isMobile)) throw new Error("skip");
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const webp = await canvas.convertToBlob({ type: "image/webp", quality: SHRINK_QUALITY });
      const chosen = pickSmaller(original, webp);
      return { bytes: await chosen.arrayBuffer(), mime: chosen.type || mime };
    } finally {
      bitmap.close?.();
    }
  } catch {
    return { bytes, mime };
  }
}
