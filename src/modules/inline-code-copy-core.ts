/* Click a piece of inline code in Reading view to copy it. */
export const COPY_MAX_LENGTH = 2000;

/** The text to copy for a clicked inline code, or null when nothing sensible should be copied. */
export function copyableText(text: string | null | undefined, selection: string): string | null {
  if (selection.trim()) return null;
  const value = String(text ?? "");
  if (!value.trim() || value.length > COPY_MAX_LENGTH) return null;
  return value;
}
