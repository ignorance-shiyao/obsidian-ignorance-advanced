# Changelog

## 1.0.2
Partial fixes for known issues. Zooming a diagram or chart (Ctrl/⌘ + wheel, trackpad pinch, the +/- buttons) now only magnifies the picture inside its frame, so the note no longer reflows; canvas charts are redrawn crisply when zoomed and diagrams can zoom up to 800%. Opening a note that is already open, including with Cmd-click or "Open in new tab", switches to its tab instead of making another. Class-diagram members no longer wrap on iOS. Dependencies updated for security advisories, build provenance attestations on releases, and fewer `!important` declarations and no `:has()` selectors in the stylesheets.

## 1.0.1
Partial fixes for known issues: class-diagram members no longer wrap onto the heading on iOS, and calendar / visualMap ECharts keep enough height on narrow screens.

## 1.0.0
First public release.
