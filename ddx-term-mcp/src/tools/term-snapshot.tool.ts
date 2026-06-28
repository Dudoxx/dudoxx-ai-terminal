/**
 * term-snapshot.tool.ts — the VISIBLE viewport grid (no -S) + dimensions.
 *
 * "What's on screen right now" (MCP-SPEC §3.10 / §3a): `capture-pane -p` WITHOUT
 * `-S` returns exactly the on-screen cols×lines grid (TUI frame, prompt,
 * spinner). Reports cols×lines from #{pane_width}x#{pane_height}. Optional ANSI
 * via -e. RESETS the terminal's read-cursor to tail (the agent has now seen the
 * whole screen). Distinct from term_read, which returns the scrollback delta.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermSnapshotInput, TermSnapshotOutput } from '@ddx/term-contract';

import { stripTrailingBlank } from '../capture-util.js';
import { resolveTerminalId, type ToolContext } from '../context.js';

export async function termSnapshot(ctx: ToolContext, input: TermSnapshotInput): Promise<TermSnapshotOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  const resolved = await ctx.resolver.resolve(terminalId);

  const dims = await ctx.tmux.paneDimensions(resolved.windowId);
  // Visible viewport ONLY (no -S). Plain text grid (no ANSI by default).
  const raw = await ctx.tmux.capturePaneVisible(resolved.windowId, false);
  const lines = stripTrailingBlank(raw.split('\n'));

  // Optional cap on returned lines (bounded by the max-read guard).
  const cap = Math.min(input.lines ?? ctx.config.maxReadLines, ctx.config.maxReadLines);
  const gridLines = lines.length > cap ? lines.slice(lines.length - cap) : lines;

  // Snapshot means the agent has now seen the whole screen → cursor to tail.
  ctx.cursor.resetToTail(terminalId, gridLines.length);

  return {
    terminalId,
    cols: dims.cols,
    lines: dims.lines,
    grid: gridLines.join('\n'),
    withAnsi: false,
  };
}
