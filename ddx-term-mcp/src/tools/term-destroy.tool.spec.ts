/**
 * term-destroy.tool.spec.ts — the protected-default guard (TERMINAL_PROTECTED).
 *
 * Asserts: destroying the default terminal is refused (no kill); destroying a
 * non-default terminal kills its window, releases the registry entry, and clears
 * the read-cursor.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { TermError } from '../errors.js';
import { termDestroy } from './term-destroy.tool.js';
import { asContext, makeContext, makeResolver } from './_test-helpers.js';

describe('term_destroy', () => {
  it('refuses to destroy the default terminal (TERMINAL_PROTECTED)', async () => {
    const ctx = makeContext();
    await expect(termDestroy(asContext(ctx), { terminalId: toTerminalId('t01') })).rejects.toMatchObject({
      code: 'TERMINAL_PROTECTED',
    });
    expect(ctx.tmux.killWindow).not.toHaveBeenCalled();
    expect(ctx.resolver.release).not.toHaveBeenCalled();
  });

  it('throws a TermError for the protected default', async () => {
    const ctx = makeContext();
    await expect(termDestroy(asContext(ctx), { terminalId: toTerminalId('t01') })).rejects.toBeInstanceOf(TermError);
  });

  it('kills the window, releases the registry, clears the cursor for a non-default', async () => {
    const resolver = makeResolver({ terminalId: toTerminalId('term-build'), windowId: '@7', panePid: 200 });
    const ctx = makeContext({ resolver });
    const res = await termDestroy(asContext(ctx), { terminalId: toTerminalId('term-build') });
    expect(ctx.tmux.killWindow).toHaveBeenCalledWith('@7');
    expect(ctx.resolver.release).toHaveBeenCalledWith(toTerminalId('term-build'));
    expect(res).toEqual({ ok: true, terminalId: toTerminalId('term-build') });
  });
});
