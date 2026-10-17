import type { IgnorancePlugin } from "../plugin-types.js";
import { readAsset } from "./assets.js";
const ARCHITECTURE_BUILTINS = new Set(["cloud", "database", "disk", "internet", "server"]);
const ARCHITECTURE_ALIASES: Record<string, string> = {
  browser: "app-window", web: "globe", website: "globe", app: "app-window", mobile: "smartphone",
  phone: "smartphone", desktop: "monitor", client: "monitor", api: "plug", gateway: "router",
  cache: "zap", queue: "list-ordered", mq: "list-ordered", storage: "hard-drive", bucket: "archive",
  auth: "shield-check", security: "shield", firewall: "brick-wall", lb: "split", loadbalancer: "split",
  cdn: "globe", search: "search", mail: "mail", email: "mail", ai: "bot", llm: "bot", model: "brain",
  function: "square-function", lambda: "square-function", container: "container", k8s: "ship-wheel",
  frontend: "app-window", backend: "server", microservice: "boxes", worker: "cog",
  job: "calendar-clock", scheduler: "calendar-clock", eventbus: "radio", bus: "radio",
  redis: "database", postgres: "database", postgresql: "database", mysql: "database", mongodb: "database",
  objectstorage: "cloud-upload", s3: "cloud-upload", blob: "cloud-upload",
  analytics: "chart-no-axes-combined", metrics: "activity", monitoring: "activity",
  logs: "scroll-text", tracing: "scan-search", identity: "fingerprint", iam: "fingerprint",
  payment: "credit-card", billing: "receipt"
};
let lucideNames: Set<string> | null = null;

interface LucidePack { icons: Record<string, { body: string }>; aliases?: Record<string, unknown> }
interface IconPackEngine {
  registerIconPacks?: (packs: Array<{ name: string; loader: () => Promise<unknown> }>) => void;
}

function registerLucideIcons(plugin: IgnorancePlugin, engine: IconPackEngine) {
  if (typeof engine.registerIconPacks !== "function") return;
  const load = async () => {
    const raw = JSON.parse(await readAsset(plugin, "lucide-icons.json")) as LucidePack;
    const icons: Record<string, { body: string }> = {};
    for (const [name, icon] of Object.entries(raw.icons)) {
      const glyph = icon.body.replace(/currentColor/g, "#fff");
      icons[name] = { body: `<g><rect width="80" height="80" style="fill: #087ebf; stroke-width: 0px;"/><g transform="translate(16 16) scale(2)">${glyph}</g></g>` };
    }
    return { prefix: "ibm-lucide", width: 80, height: 80, icons, aliases: raw.aliases || {} };
  };
  engine.registerIconPacks([{ name: "ibm-lucide", loader: load }]);
  // Names are needed synchronously when rewriting source; read them once.
  readAsset(plugin, "lucide-icons.json").then(text => {
    const raw = JSON.parse(text) as LucidePack;
    lucideNames = new Set([...Object.keys(raw.icons), ...Object.keys(raw.aliases || {})]);
  }).catch(() => {});
}

function mapArchitectureIcons(text: string) {
  if (typeof text !== "string" || !/^\s*(?:---[\s\S]*?---\s*)?architecture/m.test(text)) return text;
  return text.replace(/^(\s*(?:service|group|junction)\s+[\w-]+)\(([\w-]+)\)/gm, (whole: string, head: string, name: string) => {
    if (ARCHITECTURE_BUILTINS.has(name)) return whole;
    const keyword = name.toLowerCase();
    const target = ARCHITECTURE_ALIASES[keyword] || (lucideNames?.has(keyword) ? keyword : null);
    return target ? `${head}(ibm-lucide:${target})` : whole;
  });
}

export { ARCHITECTURE_ALIASES, registerLucideIcons, mapArchitectureIcons };
