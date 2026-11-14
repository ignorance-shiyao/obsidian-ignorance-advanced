/* Loads every knowledge view (each registers itself with kb.ts), in the order the settings list them. */
import "./kb-home.js";
import "./kb-inbox.js";
import "./kb-heatmap.js";
import "./kb-map.js";
import "./kb-timeline.js";
export { installKnowledgeBase, kbSettingItems } from "./kb.js";
