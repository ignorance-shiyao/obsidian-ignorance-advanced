/* Inline sub- and superscript written as `H~2~O` and `x^2^`. Pure parsing, no Obsidian API.
   Skipped: `~~strike~~`, colour codes `_~Rd~_`, markers like `_^tab^_`, and runs with spaces at the edges. */
export interface ScriptToken { kind: "sub" | "sup"; text: string; start: number; end: number }

const SUB = /(?<![~_\\])~(?!~)([^~\s](?:[^~\n]{0,30}?[^~\s])?)~(?![~_])/g;
const SUP = /(?<![\^_\\[])\^(?!\^)([^^\s\]](?:[^^\n\]]{0,30}?[^^\s])?)\^(?![\^_])/g;

export function parseScripts(source: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  for (const [kind, expression] of [["sub", SUB], ["sup", SUP]] as const) {
    expression.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(source))) tokens.push({ kind, text: match[1], start: match.index, end: match.index + match[0].length });
  }
  tokens.sort((a, b) => a.start - b.start);
  // Drop overlaps, keeping the earlier token.
  return tokens.filter((token, index) => index === 0 || token.start >= tokens[index - 1].end);
}
