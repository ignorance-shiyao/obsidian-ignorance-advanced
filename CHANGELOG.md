# Changelog

## 1.0.13
New: inline badges, click-to-reveal, ruby, breadcrumbs and cross references; `::: tabs` and `::: compare`; heading numbers (Reading view, Live Preview, paged view, exports; two styles); captions for figures, tables, code and equations; table extras (merged cells, tick boxes, thousands separators, percent bars, foldable rows, frozen header, crosshair); image filters and click-to-play GIFs; presentation aids (laser pointer, spotlight, step-by-step, quiet view, theme picker with palette previews, seven entrance animations with live previews); layout presets, page footer text, cover block, card layout; unpublished (struck-through) sections; auto-folded long code; navigation list, sidebar and link check; batch clipping with sort by site; reading time; gray-mode dates; syntax guide; searchable settings on Obsidian 1.13+. Smaller main.js, no `innerHTML`, official ESLint rules in the repo. Use with Ignorance 1.0.13.

## 1.0.12
Web clipping now saves to a folder you choose in settings (default Clippings).

## 1.0.11
Partial fixes for known issues. Zooming a diagram or chart (Ctrl/⌘ + wheel, trackpad pinch, the +/- buttons) only magnifies the picture inside its frame, so the note no longer reflows; canvas charts are redrawn crisply when zoomed and diagrams can zoom up to 800%. Opening a note that is already open switches to its tab instead of making another. Class-diagram members no longer wrap on iOS, and calendar / visualMap ECharts keep enough height on narrow screens. The plugin now carries the styles for its own features, including all Mermaid diagram theming, so use it with Ignorance 1.0.11 or later. Dependencies updated for security advisories, build provenance attestations on releases, and fewer `!important` declarations and no `:has()` selectors in the stylesheets.

## 1.0.0
First public release.
