/** Text normalization and small helpers shared by all parsers. */

/**
 * Normalize text as it typically arrives from PDF→text conversion:
 * unify line endings, straighten curly quotes, collapse en/em dashes to
 * `-`, and replace non-breaking spaces. Line structure is preserved.
 */
export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\u00a0/g, ' ');
}

/** Split normalized text into trimmed lines. */
export function toLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim());
}

/** Whitespace-collapse the whole text into one line, for regexes that must
 * tolerate sentences wrapped across lines by the PDF→text step. */
export function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** If the line is a bullet (`- x`, `* x`, `• x`), return its text. */
export function bulletText(line: string): string | undefined {
  const m = /^[-*•]\s+(.+)$/.exec(line);
  return m?.[1]?.trim();
}

/** Collapse whitespace and truncate for use as a context snippet. */
export function snippet(s: string, max = 200): string {
  const collapsed = flatten(s);
  return collapsed.length <= max ? collapsed : collapsed.slice(0, max - 1) + '…';
}

/** Group index accessor for a matched RegExpExecArray: returns the trimmed
 * group or undefined when the group did not participate or is empty. */
export function group(m: RegExpExecArray, i: number): string | undefined {
  const g = m[i];
  if (g === undefined) return undefined;
  const t = g.trim();
  return t.length > 0 ? t : undefined;
}
