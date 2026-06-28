/**
 * term-destroy.tool.ts — close a terminal (tmux kill-window) + clear state.
 *
 * Protects the default terminal ($DDX_TERM_DEFAULT) → TERMINAL_PROTECTED. On
 * success: kill the window, release it from the registry, drop its read-cursor.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermDestroyInput, TermDestroyOutput } from '@ddx/term-contract';

import type { ToolContext } from '../context.js';
import { TermError } from '../errors.js';

export async function termDestroy(ctx: ToolContext, input: TermDestroyInput): Promise<TermDestroyOutput> {
  if (input.terminalId === ctx.config.defaultTerminal) {
    throw new TermError('TERMINAL_PROTECTED', `refusing to destroy the default terminal: ${input.terminalId}`);
  }
  const resolved = await ctx.resolver.resolve(input.terminalId);
  await ctx.tmux.killWindow(resolved.windowId);
  await ctx.resolver.release(input.terminalId);
  ctx.cursor.clear(input.terminalId);
  return { ok: true, terminalId: input.terminalId };
}
