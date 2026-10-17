/// <reference types="node" />
/* Node built-ins for the desktop-only features (files, exports, external tools). They are required on
   first use, never at load, so the plugin still starts on mobile where Node is absent; the getters only
   add types to what `require` returns. */

export const nodeFs = (): typeof import("fs") => require("fs");
export const nodePath = (): typeof import("path") => require("path");
export const nodeOs = (): typeof import("os") => require("os");
export const nodeChildProcess = (): typeof import("child_process") => require("child_process");
