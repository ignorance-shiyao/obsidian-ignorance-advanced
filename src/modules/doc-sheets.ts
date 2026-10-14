// Named constructable stylesheets attached to the document. Used for rules that
// cannot live in styles.css because they depend on runtime values (@page size).
const sheets = new Map<string, CSSStyleSheet>();

export function setDocSheet(key: string, css: string): void {
  let sheet = sheets.get(key);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheets.set(key, sheet);
  }
  sheet.replaceSync(css);
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function removeDocSheet(key: string): void {
  const sheet = sheets.get(key);
  if (!sheet) return;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet);
  sheets.delete(key);
}
