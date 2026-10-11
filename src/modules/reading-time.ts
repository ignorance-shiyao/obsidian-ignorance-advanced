/* Reading time in the status bar: "约 3 分钟". CJK text is counted by character (400 per minute), other text by
   word (230 per minute). Front matter, code blocks and HTML comments are left out. */
export function estimateReading(markdown: string) {
  const text = String(markdown || "")
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!?\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length;
  const words = (text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, " ").match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g) || []).length;
  const minutes = cjk / 400 + words / 230;
  return { cjk, words, minutes: cjk + words === 0 ? 0 : Math.max(1, Math.round(minutes)) };
}

export function installReadingTime(plugin) {
  const { MarkdownView } = require("obsidian");
  if (!plugin.addStatusBarItem || plugin.app.isMobile) return;
  const item = plugin.addStatusBarItem();
  item.addClass("ib-reading-time");
  let timer = 0;
  const update = async () => {
    const enabled = plugin.state?.readingTime?.enabled !== false;
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!enabled || !view?.file) { item.hide(); return; }
    const text = view.getMode?.() === "source" && view.editor ? view.editor.getValue() : await plugin.app.vault.cachedRead(view.file);
    const { minutes, cjk, words } = estimateReading(text);
    if (!minutes) { item.hide(); return; }
    item.show();
    item.setText(`约 ${minutes} 分钟`);
    item.setAttribute("aria-label", `预计阅读 ${minutes} 分钟（${cjk} 个汉字，${words} 个词）`);
  };
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void update(), 400); };
  plugin.register(() => window.clearTimeout(timer));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", schedule));
  plugin.registerEvent(plugin.app.workspace.on("file-open", schedule));
  plugin.registerEvent(plugin.app.workspace.on("editor-change", schedule));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", schedule));
  plugin.refreshReadingTime = schedule;
  schedule();
}
