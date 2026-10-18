/** Keep Mermaid's success and error DOM inside a disposable export container. */
export async function renderMermaidForExport(id: string, source: string) {
  const container = document.body.createDiv({ cls: "mermaid ibp-word-mermaid-stage" });
  try {
    return await window.mermaid.render(id, source, container);
  } finally {
    container.remove();
  }
}
