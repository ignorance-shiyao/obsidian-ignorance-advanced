import { WRAP_MARKERS, wrapMarkerPair, wrapSelectionChange } from "./wrap-selection-core.js";

const { EditorSelection, Prec } = require("@codemirror/state");
const { EditorView } = require("@codemirror/view");

function wrapSelectedText(view, marker: string) {
  const selection = view.state.selection;
  if (selection.ranges.length !== 1 || selection.main.empty) return false;
  const { from, to } = selection.main;
  const pair = wrapMarkerPair(marker);
  if (!pair) return false;
  view.dispatch({
    changes: [
      { from, insert: pair.before },
      { from: to, insert: pair.after }
    ],
    selection: EditorSelection.range(from + pair.before.length, to + pair.before.length),
    userEvent: "input.type"
  });
  return true;
}

export const wrapSelectionExtension = Prec.highest(EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!WRAP_MARKERS.includes(event.key as typeof WRAP_MARKERS[number])) return false;
    const handled = wrapSelectedText(view, event.key);
    if (handled) event.preventDefault();
    return handled;
  }
}));
