/* Direct PDF output: the staged pages are copied into a standalone page that a hidden window prints to PDF, so no
   print dialog opens and text stays text. Pure string work, no Obsidian API. */

export interface PrintParts {
  title: string;
  htmlClass: string;
  bodyClass: string;
  bodyStyle: string;
  css: string;
  stageHtml: string;
  widthMm: number;
  heightMm: number;
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Obsidian serves vault files as app://<hash>/<absolute path>; a page loaded from disk cannot read those. */
export function appUrlsToFileUrls(html: string): string {
  return html
    .replace(/app:\/\/[0-9a-f]{16,}\/(?=[A-Za-z]:[\\/])/gi, "file:///")
    .replace(/app:\/\/[0-9a-f]{16,}(?=\/)/gi, "file://");
}

export function buildPrintHtml(parts: PrintParts): string {
  // Obsidian's own print rules hide every body child that is not `.print` with `!important`; the stage must beat that.
  const page = `@page { size: ${parts.widthMm}mm ${parts.heightMm}mm; margin: 0; }
html, body { height: auto !important; overflow: visible !important; background: #FFFFFF !important; margin: 0; }
@media print { html body > .ibp-print-root.ibp-print-root { display: block !important; } }`;
  return appUrlsToFileUrls(`<!doctype html>
<html class="${escapeAttribute(parts.htmlClass)}"><head><meta charset="utf-8"><title>${escapeText(parts.title)}</title>
<style>${parts.css}</style><style>${page}</style></head>
<body class="${escapeAttribute(parts.bodyClass)}" style="${escapeAttribute(parts.bodyStyle)}">${parts.stageHtml}</body></html>`);
}
