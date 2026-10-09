/* SVG styles added during native Markdown rendering must not invalidate every
   diagram in the workspace. Keep measurement in its own CSS tree; pages remain
   ordinary DOM clones with the same theme and inherited preferences. */
const styleCaches = new WeakMap<Document, { source: string; sheet: CSSStyleSheet; links: Map<string, Promise<string>> }>();

export async function stagingStyleSheet(doc: Document, fetchSource = (url: string) => fetch(url).then(response => {
  if (!response.ok) throw new Error(`无法读取测量区样式：${response.status}`);
  return response.text();
})) {
  let cache = styleCaches.get(doc);
  const links = cache?.links || new Map<string, Promise<string>>();
  const sources = await Promise.all([...doc.styleSheets].filter(sheet => !sheet.disabled).map(async sheet => {
    // CSSOM loses variable shorthand values when a later declaration overrides
    // one side (border + border-left). Preserve the original stylesheet text.
    const inline = sheet.ownerNode?.textContent;
    if (inline?.trim()) return inline;
    if (sheet.href) {
      if (!links.has(sheet.href)) {
        const source = fetchSource(sheet.href).catch(error => { links.delete(sheet.href!); throw error; });
        links.set(sheet.href, source);
      }
      return links.get(sheet.href)!;
    }
    return [...sheet.cssRules].map(rule => rule.cssText).join('\n');
  }));
  const source = sources.join('\n');
  if (cache?.source === source) return cache.sheet;
  const sheet = new (doc.defaultView as any).CSSStyleSheet();
  sheet.replaceSync(source);
  styleCaches.set(doc, { source, sheet, links });
  return sheet;
}

export async function createIsolatedStaging(plugin, parent: HTMLElement, component, signal?: AbortSignal, sharedSheet?: CSSStyleSheet) {
  const doc = parent.ownerDocument;
  const sheet = sharedSheet || await stagingStyleSheet(doc);
  signal?.throwIfAborted();
  const host = doc.createElement('div');
  host.dataset.ibpIsolation = '';
  host.style.display = 'contents';
  host.setAttribute('aria-hidden', 'true');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [sheet];
  // A body element, including its inline appearance preferences, is needed for
  // body-scoped typography rules. A div with the same classes is insufficient.
  const body = doc.body.cloneNode(false) as HTMLElement;
  body.removeAttribute('id');
  body.style.setProperty('display', 'contents', 'important');
  const context = parent.cloneNode(false) as HTMLElement;
  context.removeAttribute('id');
  const staging = doc.createElement('div');
  staging.className = 'ibp-staging markdown-preview-view markdown-rendered';
  context.appendChild(staging); body.appendChild(context); shadow.appendChild(body);
  const observer = new (doc.defaultView as any).MutationObserver(records => {
    const diagrams = new Set<Element>();
    const removed = new Set<Element>();
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('.mermaid')) removed.add(node);
        node.querySelectorAll('.mermaid').forEach(diagram => removed.add(diagram));
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const owner = node.closest('.mermaid');
        if (owner) diagrams.add(owner);
        node.querySelectorAll('.mermaid').forEach(diagram => diagrams.add(diagram));
      }
    }
    for (const diagram of removed) if (!diagram.isConnected) plugin.disposeDiagram(diagram);
    if (diagrams.size) plugin.enhanceDiagrams([...diagrams]);
  });
  observer.observe(shadow, { childList: true, subtree: true });
  let disposed = false;
  const remove = staging.remove.bind(staging);
  staging.remove = () => {
    if (disposed) return;
    disposed = true; observer.disconnect();
    for (const diagram of staging.querySelectorAll('.mermaid')) {
      try { plugin.disposeDiagram(diagram); }
      catch (error) { console.warn('Ignorance Advanced: staging cleanup', error); }
    }
    remove(); host.remove();
  };
  component.register(() => staging.remove());
  signal?.throwIfAborted();
  parent.appendChild(host);
  return staging;
}
