// ResizeObserver already supplies layout geometry. Reading clientWidth in its
// callback forces another layout when other charts have just changed styles.
export function observedSize(entry) {
  return { width:Math.round(entry.contentRect.width), height:Math.round(entry.contentRect.height) };
}

export function waitForSize(element, timeout = 1800, environment = globalThis) {
  return new Promise(resolve => {
    let finished = false, timer = 0;
    const finish = (size = null) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      environment.clearTimeout(timer);
      resolve(size);
    };
    const observer = new environment.ResizeObserver(entries => {
      const entry = entries.find(entry => entry.target === element);
      if (!entry) return;
      const size = observedSize(entry);
      if (size.width > 0 && size.height > 0) finish(size);
    });
    timer = environment.setTimeout(() => finish(), timeout);
    observer.observe(element);
  });
}
