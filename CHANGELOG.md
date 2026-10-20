# Changelog

## Unreleased
Timeline blocks in Live Preview no longer show blank lines between the items (the newline between list items was being drawn as an empty line, which spread the dots far apart). The axis now runs only from one dot to the next and no longer sticks out above the first or below the last; dots have a soft halo instead of a ring and sit inside the text column. KPI cards get a light tint and shadow, with the change figure (`_+12%_`) in the accent colour instead of italics.

The layout presets in the page settings menu (论文 / 汇报 / 公文 / 博客) now show a check mark on the one the page settings currently match; before, none was ever checked.

Review warnings cleared: no more `column-gap` or `:has()` in the stylesheet (the table tools bar now shows from a class set on pointer enter/leave), and `npm run lint:css` plus CI fail on any browser feature Obsidian 1.7.4 only partly supports.

The three page widths are wider: 窄 62% (up to 800px, was 55% / 720px), 标准 84% (up to 1100px, was 70% / 900px) and 宽 95% (up to 1400px, was 88% / 1200px).

The presentation and Mermaid styles that lived in the theme now ship with this plugin, so the theme stays small.

Undo after writing a sorted table back now restores only that table's rows; edits made elsewhere in the note in the meantime are kept. If the table itself was changed after the write, undo is refused with a notice instead of overwriting it.

Merging several notes into one Word file resolves each note's images and links from its own folder, so two notes that both use `assets/图.png` each get their own picture.

The plugin marks the page with `ib-header-path` while it manages the note-header folder path, so the Ignorance theme hides Obsidian's path only when the plugin is there to bring it back.

Table width and alignment styles now apply only to tables this plugin enhances: they step back when table enhancement is off in settings or for a note with `ib-no-tables`, and leave Dataview and Bases tables alone.

Keyboard: in the 导航 sidebar, ↓ from the search box enters the list, ↑/↓/Home/End move, Enter or Space jumps (Enter in the search box opens the first match). In reading view, table headings can be focused with Tab and sorted with Enter or Space, and report their sort state to screen readers.

Closing the batch web-clip dialog stops the links not yet started instead of clipping them in the background.

E-books keep ECharts charts as static SVG figures, and wait for a note to finish rendering (quiet DOM, 10s ceiling) instead of a fixed 700ms. The dropdown reports notes that timed out. The book language follows the note's `lang`, else the Obsidian locale.

Saved page layouts carry `updatedAt` and deletion tombstones, so layouts changed on two devices are merged by id instead of one side overwriting the other.

User templates: Markdown files in a chosen folder become new-note templates with controlled fields (title, date, author) and an optional linked layout. API: `app.plugins.plugins[...].api` lets QuickAdd or Templater apply a layout, pre-check and export a file, returning the path, warnings or failure.

A support table (content block × export format) and a starter page with a feature gallery are available from the command palette; the first run offers them in a notice. A performance baseline (cold start, first chart, 100 charts, large table) is recorded in `docs/性能基线.md`.

Interface language: 中文 / English / follow Obsidian, in the 模板与语言 settings group. Chinese text is the key, so untranslated strings fall back to Chinese. command names, the page toolbar and its menus, dialogs, export preview, the support table, task examples and the exported HTML reader follow it; the inserted Mermaid, ECharts and block templates use English sample text, and the cover and document labels follow the language too. File and folder names (such as the example folder) and caption keywords stay as they are. `npm run lint:i18n` (also in CI and `npm run check`) fails when a translated string has no English entry.

## 1.0.21
Making an e-book now has a note picker (从库中选择笔记或文件夹…): only Markdown notes are listed, a folder can be chosen to list everything in it including subfolders, and 全选当前列表 ticks them all.

WeChat and Zhihu copies no longer carry a measured height on text blocks, which left blank space at the bottom of quote blocks.

Export check in the preview follows the new design: a one-line banner (icon, count, summary) that expands to a detail list, a confirmation before it is closed, and a 查看导出检查 link to bring it back. Items that need fixing open by default and use the warning colour.

WeChat and Zhihu copies no longer keep a hand-wrapped line break after a comma or enumeration mark, which left a stub line in a narrow column.

The HTML preview no longer flashes dark while chart colours are read: the preview window stays light over a flat backdrop. The action is now named 导出为 HTML.

Export check notices in the preview are now a clear card (amber when something needs fixing, blue for notes) instead of small grey text.

合成电子书（多篇）is in the export menu, next to the other export actions.

Page-based previews (PDF, Word, page images) now show the next pages in a second step before the whole note is laid out, so less waits behind the first page.

The WeChat and Zhihu previews sit in a centred reading column on a soft backdrop, with padding, instead of a stretched full-width block.

Presentation mode no longer blinks when the full deck replaces the first slide: the new deck is laid out underneath and swapped in once ready.

Export previews load more smoothly: the HTML reader preview shows the first screen with a "loading more" bar and cross-fades to the finished page instead of swapping abruptly, and slide previews add slides in batches without waiting for the whole deck.

Saved layouts are reachable from the command palette too (保存当前页面设置为版式, 套用已保存的版式, 管理已保存的版式), so they can be used on a phone where the page toolbar is not shown.

Your own callout types: in settings, one line per type as `名称 | 颜色 | 图标` (colour as #RGB, #RRGGBB or one of info, warning, success, error; icon is a Lucide name), then write `> [!名称]`. Unreadable lines are reported and ignored.

E-book export now passes epubcheck 5.4 with no errors or warnings on a test book (images, table, code, callout, heading links): callout icons and resize handles are left out, and chapters with inline SVG or MathML are declared as such in the package file.

On phones the table tools (filter, copy, save, write back) are 36 px buttons, easier to hit with a finger.

Tables span the full width of the text column by default. Tables whose column widths were set by hand keep those widths (checked on the full-syntax sample).

The azure palette's light paper is warm white (#FAF8F4, was #F5F8FD); dark mode is unchanged. Heading numbers take the heading's colour.

Heading numbers follow the heading's weight instead of always being bold.

The command 把链接变成来源卡片 replaces a selected link (or the one on the clipboard) with a small `[!source]` callout holding the page title, description and site. The page is fetched only when you run the command, never while reading or exporting; if it cannot be read, a plain Markdown link is inserted.

The command 把标题结构插入为思维导图 turns the current note's headings into a Mermaid mindmap block at the cursor, so zoom and export of the existing diagram tools apply. Headings in code blocks and front matter are skipped.

Combine notes into an e-book: the command 把多篇笔记合成电子书 takes a list of notes (prefilled from the current note's links), makes each one a chapter in that order and writes an ePub 3 file to the export folder. Links between the listed notes point at the right chapter, a repeated image is stored once, and remote images, missing images and links leaving the book are counted in the final notice. Links to a heading (`[[note#heading]]`, `[[#heading]]`) jump to that heading. Charts cannot be stored in an ePub, so they are left out and counted. The same dialog has 生成文档版, which writes the notes in that order as one Word document (front matter removed).

Two commands, 章节上移 and 章节下移, swap the section under the cursor with its neighbour of the same level, taking sub-sections along. Headings inside code blocks and front matter are ignored, only the swapped lines are rewritten, and one undo restores them.

Batch clipping lists every link with its result (clipped, already there, failed) and offers a retry for the failures. A link counts as already clipped even if it differs only by tracking parameters, a #fragment or a trailing slash, so a retry never makes a second file.

Charts from a note's table: start an `echarts` block with `source: {#tab-id}` and the table whose caption ends in that id becomes the chart data (header row first, `1,200` and `5%` read as numbers). The chart redraws when the note changes; a missing id or a non-table caption shows a clear error. An authored `dataset` is kept.

Banner image: add `ib-banner` to `cssclasses` and a `banner` property (vault image or https address) and Reading view shows it above the text; a missing or broken image leaves no empty box.

Image processing for the current note: the command "Process this note's images" lists the PNG, JPEG, WebP and BMP images the note uses and shrinks them to a longest edge and quality you choose (optionally to WebP). The result sizes are shown before anything is written; confirming saves copies next to the originals and points this note's links at them in one edit that a single undo reverses. Originals and other notes are never changed, transparent images stay PNG, GIF and SVG are skipped, a failed image can be retried, the queue can be cancelled, and a write error rolls back the copies it made.

Speaker notes and presenter view: write notes for a slide as an Obsidian comment, `%%notes: what to say%%` (also `备注：` / `讲稿：`, one or many lines). They never appear on the slides, in the reading view or in HTML, PDF and image exports. The presentation toolbar has a new presenter view button that opens a window with the current slide's notes, a preview of the next slide, a timer with pause and reset, and previous and next buttons; it follows the presentation in both directions and closes with it (on a phone it opens beside the slides instead). PPTX exports put the notes in PowerPoint's notes pane.

Code block options: after the language, a fence can carry `title:"src/app.js"` (shown in the block header in place of the language name), `start=10` (line numbers begin at 10; `{2}` highlights still count from the block's first line), and `wrap` or `nowrap` (the block's starting wrap state). In `diff` blocks, `+` and `-` lines get a green or red background. With the plugin off the code is still complete, because Obsidian only reads the language.

Structure and typesetting check: the note check command now also reports heading levels that skip a step, cross references without a caption id, repeated caption ids, missing spaces between Chinese and English text, and half-width punctuation after Chinese. Typesetting problems can be repaired after a line-by-line before/after preview, as one edit that a single undo reverses. Code blocks, math, front matter, links, URLs and inline syntax are never touched, and repairing twice gives the same result as once.

Formats for selected text: right-click a selection and choose "Ignorance" for highlight colours, badges, spoiler, ruby, caption, cross reference, callout conversion, tabs and columns. Every item is also a command named "Format: …", so you can give it a shortcut, and each is one edit that a single undo reverses. A new command, "New task example", writes one of four example notes (weekly report, ten-slide deck, Word hand-off, web clipping) into its own folder, only when you choose one.

Enhancement switches: tables, images, code blocks and charts can each be turned off in settings ("Enhancement scope"), or for a single note by adding `ib-no-tables`, `ib-no-images`, `ib-no-code` or `ib-no-charts` to its cssclasses. Turning one off removes what it added to open notes. Blocks that Code Styler, Dataview, Bases or Excalidraw have already handled are no longer wrapped a second time. The command "Active enhancements for this note" lists what is on and why anything is off.

My layouts: in the page menu's layout submenu you can save the current page settings (reading width, paper, margins, page numbers, header and footer, paged reading and the Word font) under a name, and apply one later. Before it is applied a list shows exactly which settings change; colours and zoom are never part of a layout. A manage window renames, copies and deletes layouts and imports or exports them as a JSON file; unknown or invalid fields in an imported file are ignored and reported, and a file made by a newer version is refused.

Table aids in reading view: click a column heading to sort (ascending, descending, original order; numbers with signs, thousands separators and percents, dates and Chinese text are understood, empty cells stay last), filter rows, copy the table as TSV for a spreadsheet, or save it as CSV. Sorting only changes what is shown; "write back" rewrites the Markdown table in the note and offers an undo. Tables with merged cells or row groups are left alone.

Export check: the export preview now lists what the chosen format cannot carry over, read from the note itself and each with a line number that jumps to it. It finds images that cannot be found, broken cross references, dynamic blocks (dataview, base, tasks), remote images that are only fetched while exporting, Mermaid diagrams and the Word font. Word export also tells you how many images or diagrams did not make it into the file.

Paste enhancement: pasting a URL over selected text makes a Markdown link, and spreadsheet cells copied from Excel or Numbers paste as a Markdown table (not inside code blocks). Each has its own switch in settings and nothing is fetched from the network.

One page entry in the toolbar, labelled with the current width (for example "Standard · 785px"). Its menu is down to five items: width (narrow, standard, wide, custom, plus an optional width for this note only), heading font, layout preset, paged reading on/off, and paper & print (paper and orientation, margins, page numbers, header, footer, page breaks). In paged reading the width figure is dimmed but the menu stays available.

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
