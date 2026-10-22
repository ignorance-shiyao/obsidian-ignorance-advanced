import type { IgnorancePlugin } from "../plugin-types.js";
import { customCalloutCss, parseCustomCallouts } from "./custom-callouts-core.js";
import { removeDocSheet, setDocSheet } from "./doc-sheets.js";
const KEY = "ibp-custom-callouts";

/** Write the stylesheet for the callouts listed in the settings; returns the lines that could not be read. */
export function applyCustomCallouts(plugin: IgnorancePlugin): string[] {
  const { callouts, ignored } = parseCustomCallouts(plugin.state.customCallouts ?? "");
  if (callouts.length) setDocSheet(KEY, customCalloutCss(callouts)); else removeDocSheet(KEY);
  return ignored;
}

export function installCustomCallouts(plugin: IgnorancePlugin) {
  // Settings are loaded before installation; apply when the workspace is ready.
  plugin.app.workspace.onLayoutReady(() => { applyCustomCallouts(plugin); });
  plugin.register(() => removeDocSheet(KEY));
}
