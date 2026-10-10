# Third-party notices

Ignorance Advanced bundles the open-source software below. Each remains under its own license; the full texts of the main ones are in the `licenses/` folder.

## Vendored libraries

| Library | Version | License | Source | Notes |
| --- | --- | --- | --- | --- |
| Mermaid | 12.x | MIT | https://github.com/mermaid-js/mermaid | vendor/mermaid.min.js, built with esbuild as an IIFE |
| @mermaid-js/layout-elk (with elkjs) | see bundle | MIT (elkjs: EPL-2.0) | https://github.com/mermaid-js/mermaid | vendor/mermaid-layout-elk.min.js |
| @mermaid-js/mermaid-zenuml | 1.0.1 | MIT | https://github.com/mermaid-js/mermaid-zenuml | vendor/mermaid-zenuml.min.js |
| Apache ECharts | see file header | Apache-2.0 | https://echarts.apache.org | vendor/echarts.min.js (NOTICE in licenses/NOTICE-echarts) |
| Lucide icons via @iconify-json/lucide | see file | ISC | https://lucide.dev | vendor/lucide-icons.json (architecture diagram icons) |
| Material Icon Theme | see devDependency | MIT | https://github.com/material-extensions/vscode-material-icon-theme | language and file-type icons, built into the plugin by gen-icon-library.mjs |
| reveal.js | 6.x | MIT | https://revealjs.com | presentation view; also listed above as a dependency |
| MorphDraft | — | MIT | https://github.com/ignorance-shiyao | parts of the slide splitter (same author) |

## npm dependencies (including transitive)

| Package | Version | License |
| --- | --- | --- |
| @fast-csv/format | 4.3.5 | MIT |
| @fast-csv/parse | 4.3.6 | MIT |
| @mixmark-io/domino | 2.2.0 | BSD-2-Clause |
| @types/node | 25.9.8 | MIT |
| @types/node | 14.18.63 | MIT |
| @types/node | 22.20.4 | MIT |
| archiver | 5.3.2 | MIT |
| archiver-utils | 2.1.0 | MIT |
| archiver-utils | 3.0.4 | MIT |
| argparse | 2.0.1 | Python-2.0 |
| async | 3.2.6 | MIT |
| balanced-match | 1.0.2 | MIT |
| base64-arraybuffer | 1.0.2 | MIT |
| base64-js | 1.5.1 | MIT |
| big-integer | 1.6.52 | Unlicense |
| binary | 0.3.0 | MIT |
| bl | 4.1.0 | MIT |
| bluebird | 3.4.7 | MIT |
| brace-expansion | 1.1.21 | MIT |
| brace-expansion | 2.1.7 | MIT |
| buffer | 5.7.1 | MIT |
| buffer-crc32 | 0.2.13 | MIT |
| buffer-indexof-polyfill | 1.0.2 | MIT |
| buffers | 0.1.1 | no license declared upstream (transitive via exceljs → unzipper → binary; xlsx import on desktop only) |
| chainsaw | 0.1.0 | MIT/X11 |
| chroma-js | 3.2.0 | (BSD-3-Clause AND Apache-2.0) |
| compress-commons | 4.1.2 | MIT |
| concat-map | 0.0.1 | MIT |
| core-util-is | 1.0.3 | MIT |
| crc-32 | 1.2.2 | Apache-2.0 |
| crc32-stream | 4.0.3 | MIT |
| css-line-break | 2.1.0 | MIT |
| dayjs | 1.11.23 | MIT |
| docx | 9.7.1 | MIT |
| duplexer2 | 0.1.4 | BSD-3-Clause |
| end-of-stream | 1.4.5 | MIT |
| entities | 4.5.0 | BSD-2-Clause |
| exceljs | 4.4.0 | MIT |
| fast-csv | 4.3.6 | MIT |
| fs-constants | 1.0.0 | MIT |
| fs.realpath | 1.0.0 | ISC |
| fstream | 1.0.12 | ISC |
| glob | 7.2.3 | ISC |
| graceful-fs | 4.2.11 | ISC |
| hash.js | 1.1.7 | MIT |
| html2canvas-pro | 2.4.5 | MIT |
| https | 1.0.0 | ISC |
| ieee754 | 1.2.1 | BSD-3-Clause |
| image-size | 2.0.4 | MIT |
| immediate | 3.0.6 | MIT |
| inflight | 1.0.6 | ISC |
| inherits | 2.0.4 | ISC |
| isarray | 1.0.0 | MIT |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) — used under MIT |
| lazystream | 1.0.1 | MIT |
| lie | 3.3.0 | MIT |
| linkify-it | 5.0.2 | MIT |
| listenercount | 1.0.1 | ISC |
| lodash.defaults | 4.2.0 | MIT |
| lodash.difference | 4.5.0 | MIT |
| lodash.escaperegexp | 4.1.2 | MIT |
| lodash.flatten | 4.4.0 | MIT |
| lodash.groupby | 4.6.0 | MIT |
| lodash.isboolean | 3.0.3 | MIT |
| lodash.isequal | 4.5.0 | MIT |
| lodash.isfunction | 3.0.9 | MIT |
| lodash.isnil | 4.0.0 | MIT |
| lodash.isplainobject | 4.0.6 | MIT |
| lodash.isundefined | 3.0.1 | MIT |
| lodash.union | 4.6.0 | MIT |
| lodash.uniq | 4.5.0 | MIT |
| markdown-it | 14.3.2 | MIT |
| material-icon-theme | 5.39.0 | MIT |
| mdurl | 2.1.0 | MIT |
| minimalistic-assert | 1.0.1 | ISC |
| minimatch | 3.1.5 | ISC |
| minimatch | 5.1.9 | ISC |
| minimist | 1.2.8 | MIT |
| mkdirp | 0.5.6 | MIT |
| nanoid | 5.1.16 | MIT |
| normalize-path | 3.0.0 | MIT |
| once | 1.4.0 | ISC |
| pako | 1.0.11 | (MIT AND Zlib) |
| path-is-absolute | 1.0.1 | MIT |
| pdfjs-dist | 6.3.289 | Apache-2.0 |
| pptxgenjs | 4.0.1 | MIT |
| process-nextick-args | 2.0.1 | MIT |
| punycode.js | 2.3.1 | MIT |
| readable-stream | 2.3.8 | MIT |
| readable-stream | 3.6.2 | MIT |
| readdir-glob | 1.1.3 | Apache-2.0 |
| reveal.js | 6.0.1 | MIT |
| rimraf | 2.7.1 | ISC |
| safe-buffer | 5.1.2 | MIT |
| sax | 1.6.1 | BlueOak-1.0.0 |
| saxes | 5.0.1 | ISC |
| setimmediate | 1.0.5 | MIT |
| string_decoder | 1.1.1 | MIT |
| tar-stream | 2.2.0 | MIT |
| text-segmentation | 1.0.3 | MIT |
| tmp | 0.2.7 | MIT |
| traverse | 0.3.9 | MIT/X11 |
| turndown | 7.2.4 | MIT |
| turndown-plugin-gfm | 1.0.2 | MIT |
| uc.micro | 2.1.0 | MIT |
| undici-types | 7.24.6 | MIT |
| undici-types | 6.21.0 | MIT |
| unzipper | 0.10.14 | MIT |
| util-deprecate | 1.0.2 | MIT |
| utrie | 1.0.2 | MIT |
| uuid | 11.1.1 | MIT |
| wrappy | 1.0.2 | ISC |
| xml | 1.0.1 | MIT |
| xml-js | 1.6.11 | MIT |
| xmlchars | 2.2.0 | MIT |
| zip-stream | 4.1.1 | MIT |
