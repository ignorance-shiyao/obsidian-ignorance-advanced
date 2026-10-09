export function guardedCleanup(callback, label = "清理") {
  return () => {
    try { callback(); }
    catch (error) { console.error(`Ignorance Advanced ${label}失败`, error); }
  };
}

// Obsidian declares its Mermaid loader with a non-configurable window var.
// When it did not exist before load, clearing its writable value is the
// closest possible restoration; strict-mode delete would abort unloading.
export function restoreGlobalProperty(target, key, previous) {
  const current = Object.getOwnPropertyDescriptor(target, key);
  if (!current || current.configurable) {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  } else if (current.writable) {
    Reflect.set(target, key, previous?.value);
  }
}
