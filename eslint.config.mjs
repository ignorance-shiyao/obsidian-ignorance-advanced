import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Build and test tooling runs in Node, not in Obsidian; only src/ ships in main.js.
  globalIgnores(["dist/", "build/", "node_modules/", "vendor/", "scripts/", "*.mjs", "!eslint.config.mjs"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ["eslint.config.*"] } } }
  }
]);
