// The plugin runs inside Obsidian's window; the unit tests run in Node, where `window` does not exist.
globalThis.window ??= globalThis;
// Obsidian provides createEl(); tests use whatever `document` the test installs.
globalThis.createEl ??= (tag, options) => {
  const element = globalThis.document.createElement(tag);
  if (options && typeof options === "object") {
    if (options.cls) element.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    if (options.text != null) element.textContent = options.text;
  }
  return element;
};
globalThis.createDiv ??= options => globalThis.createEl("div", options);
globalThis.createSpan ??= options => globalThis.createEl("span", options);
