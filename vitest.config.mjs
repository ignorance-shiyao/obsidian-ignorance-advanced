import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Tests never need the embedded libraries; give them an empty stand-in.
export default defineConfig({ resolve: { alias: { "embedded-assets": path.join(here, "scripts/embedded-assets.stub.mjs") } } });
