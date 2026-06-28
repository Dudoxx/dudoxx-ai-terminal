/**
 * term-signal.tool.ts — interrupt/EOF/suspend foreground OR signal a child pid.
 *
 * Two modes (MCP-SPEC §3.7):
 *   - default (no pid): send a tmux KEY NAME (C-c/C-d/C-z/…) to the foreground.
 *     This is where TUI control keys live — never literal escapes.
 *   - with pid: VALIDATE the pid is in the terminal's FULL process tree (panePid +
 *     every descendant, not just depth-1 children) BEFORE `kill` → else
 *     PID_NOT_IN_TERMINAL. This is the terminalId ≠ pid proof (FM#4, invariant 5):
 *     you signal a PROCESS, the terminalId only ADDRESSES the terminal it must
 *     belong to. The containment set is the WHOLE descendant tree so a grandchild
 *     (shell→make→cc) is correctly accepted and a foreign pid still rejected.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermSignalInput, TermSignalOutput } from '@ddx/term-contract';

import { resolveTerminalId, type ToolContext } from '../context.js';
import { TermError } from '../errors.js';

/** tmux key-name (C-c) → kill(1) signal name (INT) for the pid-targeted path. */
const KEY_TO_SIGNAL: Readonly<Record<string, string>> = {
  'C-c': 'INT',
  'C-d': 'TERM', // EOF has no signal; closest kill is TERM for a pid target
  'C-z': 'TSTP',
  'C-\\': 'QUIT',
};

export async function termSignal(ctx: ToolContext, input: TermSignalInput): Promise<TermSignalOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  const resolved = await ctx.resolver.resolve(terminalId);

  if (input.pid === undefined) {
    // Foreground path: send the key-name to the pane (NOT literal).
    await ctx.tmux.sendKey(resolved.windowId, input.signal);
    return { ok: true, terminalId };
  }

  // pid path: validate membership in the terminal's FULL process tree first.
  // Containment must span the whole descendant tree (grandchildren included),
  // not just depth-1 children — else a legit descendant escapes the boundary.
  const panePid = await ctx.tmux.panePid(resolved.windowId);
  const descendants = await ctx.tmux.descendantPids(panePid);
  const tree = new Set<number>([panePid, ...descendants]);
  if (!tree.has(input.pid)) {
    throw new TermError('PID_NOT_IN_TERMINAL', `pid ${input.pid} is not in terminal ${terminalId}'s process tree`);
  }
  const sig = KEY_TO_SIGNAL[input.signal] ?? input.signal.replace(/^SIG/, '');
  await ctx.tmux.killPid(sig, input.pid);
  return { ok: true, terminalId, targetedPid: input.pid };
}
