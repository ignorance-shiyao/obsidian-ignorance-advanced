import { Notice, requestUrl } from "obsidian";
import { tr } from "../i18n.js";
import type { Editor } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { readSourceInfo, sourceCardMarkdown } from "./source-card-core.js";
/* "Insert a source card": the selected text (or the link on the clipboard) is fetched once, only when this
   command is run, and replaced by a small callout with the page's title and description. If the page cannot be
   read, the link is inserted as plain Markdown instead. Nothing is fetched while reading or exporting. */
async function address(editor: Editor): Promise<string> {
  const picked = editor.getSelection().trim();
  if (/^https?:\/\/\S+$/.test(picked)) return picked;
  try { return (await navigator.clipboard.readText()).trim().match(/^https?:\/\/\S+$/)?.[0] ?? ""; } catch { return ""; }
}

export function installSourceCard(plugin: IgnorancePlugin) {
  plugin.addCommand({
    id: "insert-source-card",
    name: tr("把链接变成来源卡片（选中链接或使用剪贴板）"),
    icon: "lucide-link",
    editorCallback: editor => {
      void (async () => {
        const url = await address(editor);
        if (!url) { new Notice(tr("请先选中一个网页链接，或把链接复制到剪贴板"), 4000); return; }
        let markdown = "";
        try {
          const response = await requestUrl({ url, headers: { Accept: "text/html" }, throw: true });
          markdown = sourceCardMarkdown(readSourceInfo(response.text.slice(0, 400000), url));
        } catch {
          markdown = sourceCardMarkdown({ title: "", description: "", site: "", url });
          new Notice(tr("没能读取这个网页，已插入普通链接"), 5000);
        }
        // Block text sits on its own lines; a plain link stays where the cursor is.
        editor.replaceSelection(markdown.startsWith(">") ? `\n${markdown}\n` : markdown);
      })();
    }
  });
}
