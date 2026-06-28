/**
 * term-wait-for.tool.ts — block until a regex matches the pane or timeout.
 *
 * The single biggest reliability lever (MCP-SPEC §3.6): replaces fixed sleeps.
 * Polls capturePaneVisible on a 100ms→500ms backing-off interval until the
 * pattern matches OR timeoutMs elapses. INVALID_REGEX when the pattern does not
 * compile.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermWaitForInput, TermWaitForOutput } from '@ddx/term-contract';

import { resolveTerminalId, type ToolContext } from '../context.js';
import { TermError } from '../errors.js';

const MIN_INTERVAL_MS = 100;
const MAX_INTERVAL_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function termWaitFor(ctx: ToolContext, input: TermWaitForInput): Promise<TermWaitForOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);

  let regex: RegExp;
  try {
    regex = new RegExp(input.pattern);
  } catch (err) {
    throw new TermError('INVALID_REGEX', `term_wait_for pattern did not compile: ${err instanceof Error ? err.message : String(err)}`);
  }

  const resolved = await ctx.resolver.resolve(terminalId);
  const start = Date.now();
  let interval = MIN_INTERVAL_MS;

  for (;;) {
    const grid = await ctx.tmux.capturePaneVisible(resolved.windowId, false);
    const matchedLine = grid.split('\n').find((line) => regex.test(line));
    if (matchedLine !== undefined) {
      return {
        terminalId,
        matched: true,
        reason: 'pattern',
        line: matchedLine,
        elapsedMs: Date.now() - start,
      };
    }
    if (Date.now() - start >= input.timeoutMs) {
      return { terminalId, matched: false, reason: 'timeout', elapsedMs: Date.now() - start };
    }
    await sleep(interval);
    interval = Math.min(MAX_INTERVAL_MS, Math.round(interval * 1.5));
  }
}
