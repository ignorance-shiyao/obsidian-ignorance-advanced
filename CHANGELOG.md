# Changelog

## 1.0.4
The plugin now carries the styles for its own features (diagrams, charts, containers, slides, reader, paged view, export) that used to live in the theme, which keeps the theme small. Use it with Ignorance 1.0.6 or later.

## 1.0.3
Mermaid diagrams: the plugin now releases the colors and sizes Mermaid writes as inline styles (quadrant, architecture, treemap, venn, pie, gantt) so the theme can restyle them without `!important`.

## 1.0.2
Partial fixes for known issues. Zooming a diagram or chart (Ctrl/⌘ + wheel, trackpad pinch, the +/- buttons) now only magnifies the picture inside its frame, so the note no longer reflows; canvas charts are redrawn crisply when zoomed and diagrams can zoom up to 800%. Opening a note that is already open, including with Cmd-click or "Open in new tab", switches to its tab instead of making another. Class-diagram members no longer wrap on iOS. Dependencies updated for security advisories, build provenance attestations on releases, and fewer `!important` declarations and no `:has()` selectors in the stylesheets.

## 1.0.1
Partial fixes for known issues: class-diagram members no longer wrap onto the heading on iOS, and calendar / visualMap ECharts keep enough height on narrow screens.

## 1.0.0
First public release.
