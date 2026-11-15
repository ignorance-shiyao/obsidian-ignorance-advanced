/* An explicit page break: a paragraph that holds only `---page`. Paged reading, PDF and image exports start a
   new page there, Word gets a real page break, and Reading view shows a dashed divider. */
export const PAGE_BREAK_TEXT = "---page";

export function isPageBreakText(text: string | null | undefined): boolean {
  return String(text ?? "").trim() === PAGE_BREAK_TEXT;
}
