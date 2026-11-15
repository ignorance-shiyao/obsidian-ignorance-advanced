/* Embedded pictures in a single-file export: PNG / JPEG / BMP are re-encoded to WebP, and the new bytes are kept
   only when they are smaller. Pure decisions live here; the canvas work is in image-shrink.ts. */
export const SHRINK_MAX_PIXELS = 12_000_000;
export const SHRINK_QUALITY = 0.88;

const SHRINKABLE = new Set(["image/png", "image/jpeg", "image/bmp"]);

export function canShrink(mime: string, width: number, height: number, mobile: boolean): boolean {
  if (mobile || !SHRINKABLE.has(mime)) return false;
  return width > 0 && height > 0 && width * height <= SHRINK_MAX_PIXELS;
}

/** The smaller of the two encodings; the original wins a tie and any non-WebP result. */
export function pickSmaller<T extends { size: number }>(original: T, candidate: (T & { type?: string }) | null): T {
  if (!candidate || candidate.type !== "image/webp") return original;
  return candidate.size < original.size ? candidate : original;
}
