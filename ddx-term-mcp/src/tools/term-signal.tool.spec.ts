/**
 * term-signal.tool.spec.ts — the terminalId ≠ pid proof (FM#4, invariant 5).
 *
 * Asserts: default (no pid) sends a KEY NAME to the foreground; a pid IN the
 * tree is killed; a pid OUTSIDE the tree is rejected with PID_NOT_IN_TERMINAL
 * before any kill.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { TermError } from '../errors.js';
import { termSignal } from './term-signal.tool.js';
import { asContext, makeContext, makeTmux } from './_test-helpers.js';

describe('term_signal', () => {
  it('default (no pid) sends the key-name to the foreground (not literal)', async () => {
    const ctx = makeContext();
    const res = await termSignal(asContext(ctx), { terminalId: toTerminalId('t01'), signal: 'C-c' });
    expect(ctx.tmux.sendKey).toHaveBeenCalledWith('@1', 'C-c');
    expect(ctx.tmux.killPid).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, terminalId: toTerminalId('t01') });
  });

  it('kills a pid that IS a direct child in the terminal process tree', async () => {
    const tmux = makeTmux({ panePid: async () => 100, descendantPids: async () => [555, 556] });
    const ctx = makeContext({ tmux });
    const res = await termSignal(asContext(ctx), { signal: 'C-c', pid: 555 });
    expect(ctx.tmux.killPid).toHaveBeenCalledWith('INT', 555);
    expect(res).toEqual({ ok: true, terminalId: toTerminalId('t01'), targetedPid: 555 });
  });

  it('kills a GRANDCHILD pid (full descendant tree, not just depth-1)', async () => {
    // panePid 100 → child 555 → grandchild 777. The containment set is the WHOLE
    // descendant tree, so signalling the grandchild 777 is accepted (AC#14 / FM#4).
    const tmux = makeTmux({ panePid: async () => 100, descendantPids: async () => [555, 777] });
    const ctx = makeContext({ tmux });
    const res = await termSignal(asContext(ctx), { signal: 'C-c', pid: 777 });
    expect(ctx.tmux.killPid).toHaveBeenCalledWith('INT', 777);
    expect(res).toEqual({ ok: true, terminalId: toTerminalId('t01'), targetedPid: 777 });
  });

  it('rejects a FOREIGN pid (outside the descendant tree) with PID_NOT_IN_TERMINAL (no kill)', async () => {
    const tmux = makeTmux({ panePid: async () => 100, descendantPids: async () => [555, 777] });
    const ctx = makeContext({ tmux });
    await expect(termSignal(asContext(ctx), { signal: 'C-c', pid: 999 })).rejects.toMatchObject({
      code: 'PID_NOT_IN_TERMINAL',
    });
    expect(ctx.tmux.killPid).not.toHaveBeenCalled();
  });

  it('throws a TermError (not a bare Error) on a foreign pid', async () => {
    const tmux = makeTmux({ panePid: async () => 100, descendantPids: async () => [] });
    const ctx = makeContext({ tmux });
    await expect(termSignal(asContext(ctx), { signal: 'C-c', pid: 7 })).rejects.toBeInstanceOf(TermError);
  });
});
