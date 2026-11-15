/* Read-only HTML preview: what a page may do inside the preview frame.
   Every page runs its own scripts by default; the reader can stop them for a tab. Scripts never get the note app's
   origin, forms, popups, network or storage: the frame has no `allow-same-origin`, and the policy below allows only
   inline scripts. */
export interface PreviewPolicy { sandbox: string; csp: string }

export function previewPolicy(allowScripts: boolean): PreviewPolicy {
  const scripts = allowScripts ? "script-src 'unsafe-inline'" : "script-src 'none'";
  return {
    sandbox: allowScripts ? "allow-scripts" : "",
    csp: [
      "default-src 'none'", scripts, "object-src 'none'", "frame-src 'none'", "form-action 'none'", "base-uri app:",
      "img-src app: data: blob: https: http:", "style-src 'unsafe-inline' app: data: https: http:",
      "font-src app: data: https: http:", "media-src app: data: blob: https: http:"
    ].join("; ")
  };
}
