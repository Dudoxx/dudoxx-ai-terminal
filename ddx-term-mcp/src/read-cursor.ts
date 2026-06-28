/**
 * read-cursor.ts — per-terminalId "what's new" offset.
 *
 * MCP-local in BOTH broker-attached and standalone modes (shard 06): the cursor
 * is the AGENT's view of new output, not shared session truth. `term_read`
 * (since='last') returns only lines past the cursor; `term_snapshot` and a full
 * read reset the cursor to the current tail.
 *
 * The cursor stores the absolute toLine index of the last line the agent has
 * seen for a terminal. A capture is split into lines; lines whose absolute index
 * exceeds the cursor are the delta.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TerminalId } from '@ddx/term-contract';

/** The delta computed for one read, plus the line-range it covers. */
export interface ReadDelta {
  /** The new text (lines past the previous cursor), joined by '\n'. */
  readonly text: string;
  /** First absolute line index returned (inclusive). */
  readonly fromLine: number;
  /** Last absolute line index returned (inclusive); the new cursor value. */
  readonly toLine: number;
}

/**
 * Tracks, per terminalId, the absolute index of the last line the agent has
 * consumed. Absolute indices are derived from the total captured line count so
 * a growing scrollback yields a monotonic cursor.
 */
export class ReadCursor {
  private readonly cursors = new Map<TerminalId, number>();

  /** The last consumed absolute line index for a terminal (-1 = nothing read). */
  private get(terminalId: TerminalId): number {
    return this.cursors.get(terminalId) ?? -1;
  }

  /**
   * Compute the delta for a fresh capture. `lines` is the full ordered set of
   * captured lines (oldest→newest); `totalLines` is its length and defines the
   * absolute tail index (totalLines - 1). Returns only lines whose absolute
   * index is greater than the stored cursor, and advances the cursor to the tail.
   */
  delta(terminalId: TerminalId, lines: readonly string[]): ReadDelta {
    const total = lines.length;
    const tail = total - 1;
    const prev = this.get(terminalId);
    // Absolute index of the first NOT-yet-seen line.
    const startAbs = prev + 1;
    if (startAbs > tail) {
      // Nothing new since last read — empty delta, cursor unchanged.
      this.cursors.set(terminalId, tail < 0 ? -1 : tail);
      return { text: '', fromLine: total, toLine: total };
    }
    // The capture is the most-recent `total` lines; map absolute → array index.
    // We treat the whole capture as the absolute window [0 .. tail], so the
    // array index equals the absolute index here (single-capture model).
    const sliceStart = Math.max(0, startAbs);
    const newLines = lines.slice(sliceStart);
    this.cursors.set(terminalId, tail);
    return { text: newLines.join('\n'), fromLine: sliceStart, toLine: tail };
  }

  /** Reset the cursor to the tail of a capture (snapshot / full-read semantics). */
  resetToTail(terminalId: TerminalId, totalLines: number): void {
    this.cursors.set(terminalId, totalLines - 1);
  }

  /** Drop a terminal's cursor entirely (on term_destroy). */
  clear(terminalId: TerminalId): void {
    this.cursors.delete(terminalId);
  }
}
