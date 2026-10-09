const { Decoration, ViewPlugin } = require("@codemirror/view");

// ECharts fences contain JSON, but Obsidian does not recognize this language
// name as JSON. Decorate its source without changing the stored fence name.
function decorations(view) {
  const ranges = [];
  const doc = view.state.doc;
  let fence = null;
  let echarts = false;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const match = line.text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!fence && match) { fence = match[1]; echarts = /^echarts\b/i.test(match[2].trim()); continue; }
    if (fence && match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) { fence = null; echarts = false; continue; }
    if (!echarts) continue;
    const tokens = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[{}\[\],:]/g;
    for (const token of line.text.matchAll(tokens)) {
      const value = token[0];
      const type = value.startsWith('"') ? /^\s*:/.test(line.text.slice(token.index + value.length)) ? "property" : "string" : /^[{}\[\],:]$/.test(value) ? "punctuation" : /^(true|false|null)$/.test(value) ? "keyword" : "number";
      ranges.push(Decoration.mark({ class: `ibm-mermaid-${type} ib-echarts-token` }).range(line.from + token.index, line.from + token.index + value.length));
    }
  }
  return Decoration.set(ranges, true);
}
export const echartsSourceHighlighter = ViewPlugin.fromClass(class {
  decorations;
  constructor(view) { this.decorations = decorations(view); }
  update(update) { if (update.docChanged || update.viewportChanged) this.decorations = decorations(update.view); }
}, { decorations: value => value.decorations });
