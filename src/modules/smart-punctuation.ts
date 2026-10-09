import { smartPunctuationChange } from "./smart-punctuation-core.js";

const { EditorSelection, Prec } = require("@codemirror/state");
const { EditorView } = require("@codemirror/view");

export function smartPunctuationExtension(plugin) {
  return Prec.highest(EditorView.domEventHandlers({
    keydown(event, view) {
      if (!plugin.state?.smartPunctuation || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
      if (event.key !== "-" && event.key !== ".") return false;
      const selection = view.state.selection.main;
      if (!selection.empty) return false;
      const source = view.state.doc.toString();
      const change = smartPunctuationChange(source, selection.head, event.key, true);
      if (!change) return false;
      event.preventDefault();
      view.dispatch({
        changes: { from: change.from, to: change.to, insert: change.insert },
        selection: EditorSelection.cursor(change.cursor),
        userEvent: "input.type"
      });
      return true;
    }
  }));
}
