export interface TocHeading { level: number; heading: string; position: { start: { line: number } } }
export interface TocItem { level: number; text: string; line: number }

export function isTocDirective(line: string): boolean {
  return /^\s*(?:\[toc\]|\[\[toc\]\])\s*$/i.test(line);
}

export function extractTocHeadings(headings: TocHeading[] = []): TocItem[] {
  return headings.map(heading => ({ level: heading.level, text: heading.heading, line: heading.position.start.line }));
}
