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
  // fgPid stays the direct foreground child (depth-1) — its meaning is
  // "what tmux would foreground next," unchanged by this D4 alignment.
  const children = await ctx.tmux.childPids(panePid);
  // processes[] goes FULL-TREE (descendantPids) so grandchildren appear —
  // matches term_signal's tree boundary (term-signal.tool.ts), so an agent
  // inspecting via term_ps sees every pid term_signal would actually accept.
  const descendants = await ctx.tmux.descendantPids(panePid);
  const rows = await ctx.tmux.psRows([panePid, ...descendants]);

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
