/**
 * term-panes.tool.ts — list the panes (splits) WITHIN one terminal + dimensions.
 *
 * Helper verb (MCP-SPEC §3.9): a terminal (tmux window) may hold multiple panes;
 * this enumerates them with their cols×lines + running command.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermPane, TermPanesInput, TermPanesOutput } from '@ddx/term-contract';

import { resolveTerminalId, type ToolContext } from '../context.js';

export async function termPanes(ctx: ToolContext, input: TermPanesInput): Promise<TermPanesOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  const resolved = await ctx.resolver.resolve(terminalId);
  const rows = await ctx.tmux.listPanes(resolved.windowId);
  const panes: TermPane[] = rows.map((p) => ({
    id: p.paneId,
    width: p.width,
    height: p.height,
    command: p.command,
  }));
  return { terminalId, panes };
}
