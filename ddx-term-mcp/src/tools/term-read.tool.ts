/**
 * term-read.tool.ts — scrollback DELTA (default) or full visible+history.
 *
 * DEFAULT (since='last'): only the lines new since this terminal's read-cursor
 * (FM#3 token guard). since='all': the full capture, capped by
 * DDX_TERM_MAX_READ_LINES. Both paths read scrollback (`capture-pane -S -N`);
 * the per-terminalId cursor turns that into a delta. The visible-only viewport
 * is term_snapshot's job, not this one.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermReadInput, TermReadOutput } from '@ddx/term-contract';

import { stripTrailingBlank } from '../capture-util.js';
import { resolveTerminalId, type ToolContext } from '../context.js';

export async function termRead(ctx: ToolContext, input: TermReadInput): Promise<TermReadOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  const resolved = await ctx.resolver.resolve(terminalId);

  const cap = Math.min(input.lines ?? ctx.config.maxReadLines, ctx.config.maxReadLines);
  // Pull up to `cap` lines of scrollback above the viewport.
  const raw = await ctx.tmux.capturePaneScrollback(resolved.windowId, cap);
  // tmux pads the capture to the full viewport height with trailing blank lines
  // (real content sits at the top). Strip ALL trailing blanks so the line count
  // tracks real content — otherwise new output never raises the line count and
  // the delta cursor never advances (the constant-height capture trap).
  const lines = stripTrailingBlank(raw.split('\n'));

  // Cap from the tail (most recent) when the buffer exceeds the line cap.
  const capped = lines.length > cap;
  const windowLines = capped ? lines.slice(lines.length - cap) : lines;

  if (input.since === 'all') {
    // Full capture; reset the cursor to the tail so the next 'last' is a delta.
    ctx.cursor.resetToTail(terminalId, windowLines.length);
    return {
      terminalId,
      text: windowLines.join('\n'),
      fromLine: 0,
      toLine: windowLines.length > 0 ? windowLines.length - 1 : 0,
      truncated: capped,
    };
  }

  // since='last' → delta past the cursor.
  const delta = ctx.cursor.delta(terminalId, windowLines);
  return {
    terminalId,
    text: delta.text,
    fromLine: delta.fromLine,
    toLine: delta.toLine,
    truncated: capped,
  };
}
