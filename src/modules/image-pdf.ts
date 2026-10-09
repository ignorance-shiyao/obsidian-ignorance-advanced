/* A PDF made of one JPEG per page, for mobile where Electron's print-to-pdf
   is missing. Text is not selectable, but the pages match the paged view.
   JPEG goes in as-is (DCTDecode), so no image library is needed. */

function jpegSize(bytes) {
  // Walk the markers to the first SOFn frame header.
  for (let i = 2; i < bytes.length - 8;) {
    if (bytes[i] !== 0xFF) { i += 1; continue; }
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + length;
  }
  throw new Error("无法读取页面图片尺寸");
}

// pages: [{ jpeg: Uint8Array }], size in millimetres (every page the same paper).
export function buildImagePdf(pages, { widthMm, heightMm }) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = part => { const bytes = typeof part === "string" ? encoder.encode(part) : part; chunks.push(bytes); length += bytes.length; };
  const object = (id, body, stream) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  const w = (widthMm * 72 / 25.4).toFixed(2), h = (heightMm * 72 / 25.4).toFixed(2);
  const count = pages.length;
  // 1 catalog, 2 page tree, then per page: page, content, image.
  const pageId = index => 3 + index * 3;
  push("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${count} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`);
  pages.forEach(({ jpeg }, index) => {
    const id = pageId(index);
    const { width, height } = jpegSize(jpeg);
    const content = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>`, content);
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  });
  const total = 3 + count * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id += 1) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
