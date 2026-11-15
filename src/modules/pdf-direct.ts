import { Platform } from "obsidian";
import { buildPrintHtml } from "./pdf-direct-core.js";
/* Writes the staged pages to PDF bytes through a hidden window, with no print dialog. Returns null when the
   desktop pieces are missing or the print fails, so the caller can fall back to the system print dialog. */

interface PdfWindow {
  loadFile(path: string): Promise<void>;
  webContents: { executeJavaScript(code: string): Promise<unknown>; printToPDF(options: object): Promise<Uint8Array> };
  destroy(): void;
}
type Require = (id: string) => unknown;
interface NodeFs { promises: { writeFile(path: string, data: string, encoding: string): Promise<void>; unlink(path: string): Promise<void> } }

const nodeRequire = (): Require | null => (Platform.isDesktopApp ? (window as unknown as { require?: Require }).require ?? null : null);

/* Same guarded loading as the other desktop file helpers: only reached on desktop, resolved by name at run time. */
const load = <T>(id: string): T | null => {
  try { return (nodeRequire()?.(id) as T | undefined) ?? null; } catch { return null; }
};

function browserWindowClass(): (new (options: object) => PdfWindow) | null {
  try {
    const remote = (nodeRequire()?.("electron") as { remote?: { BrowserWindow?: new (options: object) => PdfWindow } } | undefined)?.remote;
    return remote?.BrowserWindow ?? null;
  } catch { return null; }
}

export const canWritePdfDirectly = () => browserWindowClass() !== null;

/** Every rule the page is using, read from the style sheets themselves: linked and script-added sheets included. */
function collectCss(doc: Document): string {
  const out: string[] = [];
  const read = (sheet: CSSStyleSheet) => {
    try { out.push(Array.from(sheet.cssRules, rule => rule.cssText).join("\n")); } catch { /* a sheet from another origin cannot be read */ }
  };
  Array.from(doc.styleSheets).forEach(read);
  (doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets?.forEach(read);
  return out.join("\n");
}

/** Canvases lose their pixels when copied as markup; swap each for an image of what it shows. */
function freezeCanvases(root: HTMLElement) {
  root.querySelectorAll("canvas").forEach(canvas => {
    try {
      const image = createEl("img");
      image.src = canvas.toDataURL();
      image.style.cssText = canvas.style.cssText;
      image.width = canvas.width;
      image.height = canvas.height;
      canvas.replaceWith(image);
    } catch { /* a tainted canvas stays blank */ }
  });
}

export async function stageToPdf(stage: HTMLElement, options: { title: string; widthMm: number; heightMm: number }): Promise<Uint8Array | null> {
  const BrowserWindow = browserWindowClass();
  if (!BrowserWindow) return null;
  const doc = stage.ownerDocument;
  const copy = stage.cloneNode(true) as HTMLElement;
  copy.addClass("ibp-print-root");
  freezeCanvases(copy);
  const html = buildPrintHtml({
    title: options.title,
    htmlClass: doc.documentElement.className,
    bodyClass: doc.body.className,
    bodyStyle: doc.body.style.cssText,
    css: collectCss(doc),
    stageHtml: copy.outerHTML,
    widthMm: options.widthMm,
    heightMm: options.heightMm
  });
  const fs = load<NodeFs>("fs");
  const os = load<{ tmpdir(): string }>("os");
  const path = load<{ join(...parts: string[]): string }>("path");
  if (!fs || !os || !path) return null;
  const temp = path.join(os.tmpdir(), `ibp-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  let win: PdfWindow | null = null;
  try {
    await fs.promises.writeFile(temp, html, "utf8");
    win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { backgroundThrottling: false } });
    await win.loadFile(temp);
    await win.webContents.executeJavaScript(`Promise.race([
      Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode().catch(() => {}))]),
      new Promise(done => setTimeout(done, 15000))
    ]).then(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))`);
    const data = await win.webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } });
    return new Uint8Array(data);
  } catch (error) {
    console.error("Ignorance Advanced: direct PDF failed, using the print dialog —", error);
    return null;
  } finally {
    win?.destroy();
    void fs.promises.unlink(temp).catch(() => { /* the system clears its temp folder */ });
  }
}
