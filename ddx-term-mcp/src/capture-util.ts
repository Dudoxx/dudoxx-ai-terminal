/**
 * capture-util.ts — normalize a tmux capture-pane result.
 *
 * `capture-pane -p` pads its output to the full viewport height with trailing
 * blank lines, with real content at the top. If those blanks are counted, the
 * line count stays ~constant as output scrolls — and the per-terminal read
 * cursor (which advances by line count) never moves, so term_read returns an
 * empty delta forever (the constant-height capture trap, found in e2e). Strip
 * the trailing blanks so the line count reflects real content.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

/** Drop all trailing empty (or whitespace-only) lines from a split capture. */
export function stripTrailingBlank(lines: readonly string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(0, end);
}
