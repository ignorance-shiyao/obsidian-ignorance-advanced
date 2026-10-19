// What Obsidian's directory review flags in CSS, run locally so it never reaches a release:
//  - features only partly supported by the oldest Obsidian we declare (Chrome 128, Obsidian 1.7.4):
//    multi-column properties (column-gap, columns…), box-decoration-break, text-decoration longhands and
//    multi-value shorthands such as `underline double`;
//  - :has(), whose invalidation cost the review warns about.
//   node scripts/lint-css.mjs [file.css …]      default: the built stylesheets of this repository
// Zero warnings is the bar: a warning fails the check. Fix the CSS (a class set from script, border-bottom,
// gap, …) rather than adding an exception.
import { existsSync } from "node:fs";
import stylelint from "stylelint";

const files = process.argv.slice(2).length ? process.argv.slice(2) : ["theme.css", "styles.css", "theme-features.css", "reveal.css"].filter(existsSync);
const result = await stylelint.lint({
  files,
  config: {
    plugins: ["stylelint-no-unsupported-browser-features"],
    rules: {
      "plugin/no-unsupported-browser-features": [true, { browsers: ["Chrome >= 128"], ignorePartialSupport: false, severity: "error" }],
      "selector-pseudo-class-disallowed-list": [["has"], { severity: "error", message: ":has() is flagged by the Obsidian review (slow selector invalidation); set a class from script instead" }]
    }
  }
});
let problems = 0;
for (const file of result.results) for (const warning of file.warnings) {
  problems += 1;
  console.log(`✘ ${file.source.split("/").pop()}:${warning.line}:${warning.column} ${warning.text}`);
}
console.log(problems ? `\n${problems} CSS lint problem(s)` : `✔ CSS lint clean (${files.join(", ")})`);
process.exit(problems ? 1 : 0);
