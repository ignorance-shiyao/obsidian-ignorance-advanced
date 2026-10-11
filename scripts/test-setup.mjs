// The plugin runs inside Obsidian's window; the unit tests run in Node, where `window` does not exist.
globalThis.window ??= globalThis;
