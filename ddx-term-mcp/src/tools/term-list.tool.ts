/**
 * term-list.tool.ts — enumerate all terminals with live process snapshots.
 *
 * Delegates to the resolver, which is the registry owner (broker REST mirror in
 * broker-attached mode, local map in standalone). The agent's directory of what
 * exists.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermListInput, TermListOutput } from '@ddx/term-contract';

import type { ToolContext } from '../context.js';

export async function termList(ctx: ToolContext, _input: TermListInput): Promise<TermListOutput> {
  const terminals = await ctx.resolver.list();
  return { terminals };
}
