/* Put plugin-built markup (bundled icons, rendered diagrams, restored note HTML) into an element without
   assigning `innerHTML`. The markup is parsed into an inert document first, so scripts never run, and the
   parsed nodes are cached because the same icons are placed many times (file tree, toolbars). */
const parsed = new Map<string, DocumentFragment>();
const CACHE_LIMIT = 400;

function fragmentFor(markup: string): DocumentFragment {
  let fragment = parsed.get(markup);
  if (!fragment) {
    const doc = new DOMParser().parseFromString(markup, "text/html");
    fragment = document.createDocumentFragment();
    for (const node of Array.from(doc.body.childNodes)) fragment.appendChild(document.importNode(node, true));
    if (markup.length < 20000) {
      if (parsed.size >= CACHE_LIMIT) parsed.delete(parsed.keys().next().value);
      parsed.set(markup, fragment);
    }
  }
  return fragment;
}

export function setMarkup(element: Element, markup: string) {
  const owner = element.ownerDocument || document;
  const fragment = fragmentFor(String(markup ?? ""));
  const copy = owner === document ? fragment.cloneNode(true) : owner.importNode(fragment, true);
  element.replaceChildren(copy);
}
