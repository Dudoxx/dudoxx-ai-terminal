/**
 * term-ps.tool.ts — resolve the live process tree for a terminal (pid side).
 *
 * The pid-side introspection (MCP-SPEC §3.8): panePid (shell) + fgPid (first
 * child) + the full ps rows. Lets the agent know exactly what is running, and
 * its PID, before signalling/killing via term_signal(pid). This is what makes
 * terminalId ≠ pid observable.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { ProcessInfo, TermPsInput, TermPsOutput } from '@ddx/term-contract';

import { resolveTerminalId, type ToolContext } from '../context.js';

export async function termPs(ctx: ToolContext, input: TermPsInput): Promise<TermPsOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  const resolved = await ctx.resolver.resolve(terminalId);

  const panePid = await ctx.tmux.panePid(resolved.windowId);
  const children = await ctx.tmux.childPids(panePid);
  const rows = await ctx.tmux.psRows([panePid, ...children]);

  const processes: ProcessInfo[] = rows.map((r) => ({
    pid: r.pid,
    ppid: r.ppid,
    stat: r.stat,
    command: r.command,
  }));

  return {
    terminalId,
    panePid,
    fgPid: children[0] ?? null,
    processes,
  };
}
