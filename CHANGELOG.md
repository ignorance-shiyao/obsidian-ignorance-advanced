# Changelog

## Unreleased
The width label and the page settings button are now one toolbar entry: its menu lists the note's width and this device's default first, then fonts, presets, layout, paper, margins, page breaks, page numbers, header and footer. In paged reading the width figure is dimmed but the menu stays available.

Word export now includes remote images (fetched once while exporting), HTML `<img>` tags and SVG pictures on phones, and keeps image paths with a Markdown title. Image and embed syntax inside code blocks and inline code is left as written.

## 1.0.20
Word export offers Microsoft YaHei (default), the current theme body font for both body text and headings, or SimSun in settings. Standalone HTML readers preserve light/dark mode, content width and chapter anchors in the URL fragment across reloads without browser storage. Chapter restoration waits for page load, and the initial theme is applied before styles load. Embedded previews keep their URL unchanged.

Page zoom keeps table and image controls aligned, and block resizing, diagram panning and chart zooming use consistent coordinates. The width menu separates the current note from the device default. On phones code blocks start wrapped (the wrap button still switches it). Use with Ignorance 1.0.20 or later.

## 1.0.19
Split slides lay out in two balanced grid columns measured at build time instead of CSS multi-column (a single list is split between the columns, numbered lists keep counting). Exported HTML pages no longer store reader choices in the browser (they last while the page is open), and web clipping no longer reads the clipboard by itself when it finds a failed shared page; the clipboard is read only when you open the clip dialog, run the re-clip command, or turn on link detection.

Word export: body text and headings use Microsoft YaHei, headings 1–3 get their own sizes, code keeps a real monospace family instead of a CSS system alias, and a diagram that fails to render no longer leaves an error box in the note window. Mermaid 12-only snippets, styles and layout helpers are gone, and the quadrant chart template quotes its Chinese labels so Obsidian's Mermaid 11 parses it. Code blocks fill the reading column unless the fence sets `{align=…}` or `{width=…}`. Export and image-tool hints name the supported formats, desktop PDF export explains how to save from the print dialog, and the diagram illustration no longer advertises removed engines.

## 1.0.18
Store review follow-up: main.js no longer contains code that creates script elements. The build removes the old-IE setImmediate fallbacks in the bundled zip and Word libraries and Reveal's script-dependency loader (the plugin never used either); the release check now refuses any such code.

## 1.0.17
Store review follow-up: the Office / PDF / Notion import converters are now TypeScript, so the directory's type-checked lint finds nothing left to flag. Exports look up each image by its path instead of listing every file in the vault, and web clipping only scans the clip folder (plus the vault root and the new-note folder when repairing shared pages) instead of the whole vault.

## 1.0.16
Store review clean-up: main.js shrinks from 7.2 MB to 3.6 MB and the code passes the directory's ESLint rules with no errors or warnings. Diagrams now use Obsidian's built-in Mermaid (11), so the families only Mermaid 12 offered (use case, Wardley, Ishikawa, event modeling, tree view), ZenUML and ELK layout are gone. The plugin no longer touches the file system, other programs or Electron: every export is saved into the vault's `导出/` folder, PDF on desktop goes through the system print dialog ("Save as PDF" keeps text selectable), and Word, Excel, PowerPoint, PDF, HTML and Notion imports run inside Obsidian (PDF and HTML through Obsidian's own converters). Removed with that: editing files outside the vault, "Open with" external apps and Pandoc. No `eval`, no `fetch`, no `!important` in the stylesheets.

The plugin now carries the styles for its own inline chips, bars and sparklines, the clip dialog, the path toggle, writing focus, heading badges and callout animations (they used to ship in the theme). Use with Ignorance 1.0.16 or later.

## 1.0.15
Page width: each preset (narrow, standard, wide) is a share of the window with a pixel cap, so lines stay readable on wide screens; drag the page edge to set a custom width; the width button shows the laid-out width; per-note width (wider / narrower) from the width menu. Zoom (Ctrl + wheel) is kept as a preview scale and only magnifies the laid-out page. With Obsidian's "Readable line length" off the page fills the window. Phones: the page uses the full screen width, and the note menu gets "Jump to heading, chart or table". Reading positions merge across synced devices instead of overwriting each other. Fixes: PDF export produced a single blank page on recent Obsidian versions; chart left / center / right alignment; empty [toc] in paged reading for new or just-edited notes. Text element styles (quotes, highlights, keys, footnotes, details, checkboxes, definition lists, tables) moved to the theme. Use with Ignorance 1.0.15 or later.

## 1.0.14
Store review fixes: no more inline styles assigned from script (static ones are now CSS classes, the rest use `setCssStyles` / `setCssProps`), and the print page-size rules use a constructable stylesheet instead of `<style>` elements.

## 1.0.13
New: inline badges, click-to-reveal, ruby, breadcrumbs and cross references; `::: tabs` and `::: compare`; heading numbers (Reading view, Live Preview, paged view, exports; two styles, start level and depth are configurable); captions for figures, tables, code and equations; table extras (merged cells, tick boxes, thousands separators, percent bars, foldable rows, frozen header, crosshair); image filters and click-to-play GIFs (set from the image toolbar, no source editing needed); presentation aids (laser pointer, spotlight, step-by-step, quiet view, theme picker with palette previews, seven entrance animations with live previews); layout presets, page footer text, cover block, card layout; page width as a share of the window and Ctrl + wheel zoom that magnifies the whole page without reflowing it; unpublished (struck-through) sections; tables typed without a blank line above are still recognised (Reading view, pages, exports; a blank line is added while editing, plus a command for old notes); auto-folded long code; navigation list, sidebar and link check; batch clipping with sort by site; reading time; gray-mode dates; syntax guide; searchable settings on Obsidian 1.13+. Smaller main.js, no `innerHTML`, official ESLint rules in the repo. Use with Ignorance 1.0.13 or later.

## 1.0.12
Web clipping now saves to a folder you choose in settings (default Clippings).

## 1.0.11
Partial fixes for known issues. Zooming a diagram or chart (Ctrl/⌘ + wheel, trackpad pinch, the +/- buttons) only magnifies the picture inside its frame, so the note no longer reflows; canvas charts are redrawn crisply when zoomed and diagrams can zoom up to 800%. Opening a note that is already open switches to its tab instead of making another. Class-diagram members no longer wrap on iOS, and calendar / visualMap ECharts keep enough height on narrow screens. The plugin now carries the styles for its own features, including all Mermaid diagram theming, so use it with Ignorance 1.0.11 or later. Dependencies updated for security advisories, build provenance attestations on releases, and fewer `!important` declarations and no `:has()` selectors in the stylesheets.

## 1.0.0
First public release.
