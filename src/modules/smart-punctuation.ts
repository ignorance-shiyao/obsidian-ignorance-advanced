import type { IgnorancePlugin } from "../plugin-types.js";
import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { smartPunctuationChange } from "./smart-punctuation-core.js";


export function smartPunctuationExtension(plugin: IgnorancePlugin) {
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
