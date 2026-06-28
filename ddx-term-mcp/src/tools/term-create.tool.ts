/**
 * term-create.tool.ts — allocate a new terminal (tmux window).
 *
 * Idempotent on an existing slug (returns it with created:false). Guards
 * MAX_TERMINALS before allocating. Maps to the resolver's create() (which owns
 * window allocation + registry write, broker- or local-mode).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermCreateInput, TermCreateOutput } from '@ddx/term-contract';

import type { ToolContext } from '../context.js';
import { TermError } from '../errors.js';

export async function termCreate(ctx: ToolContext, input: TermCreateInput): Promise<TermCreateOutput> {
  const current = await ctx.resolver.count();
  if (current >= ctx.config.maxTerminals) {
    throw new TermError('MAX_TERMINALS', `terminal limit reached (${ctx.config.maxTerminals}) — destroy one first`);
  }
  const { resolved, cwd, created } = await ctx.resolver.create(input.name, input.cwd);
  return {
    terminalId: resolved.terminalId,
    windowId: resolved.windowId,
    panePid: resolved.panePid,
    cwd,
    created,
  };
}
