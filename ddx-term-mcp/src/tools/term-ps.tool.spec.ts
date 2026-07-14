/**
 * term-ps.tool.spec.ts — processes[] is FULL-TREE, fgPid stays depth-1 (D4).
 *
 * Asserts: processes[] is built from descendantPids (so a grandchild appears),
 * matching term_signal's tree boundary; fgPid is still the direct foreground
 * child from childPids, unchanged meaning.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termPs } from './term-ps.tool.js';
import { asContext, makeContext, makeTmux } from './_test-helpers.js';

describe('term_ps', () => {
  it('lists a GRANDCHILD pid in processes[] via descendantPids (full tree)', async () => {
    // panePid 100 → direct child 555 → grandchild 777. childPids (depth-1)
    // sees only 555; descendantPids (full tree) sees 555 AND 777.
    const tmux = makeTmux({
      panePid: async () => 100,
      childPids: async () => [555],
      descendantPids: async () => [555, 777],
      psRows: async (pids: number[]) =>
        pids.map((pid) => ({ pid, ppid: pid === 777 ? 555 : 100, stat: 'S', command: 'x' })),
    });
    const ctx = makeContext({ tmux });
    const res = await termPs(asContext(ctx), { terminalId: toTerminalId('t01') });

    expect(ctx.tmux.psRows).toHaveBeenCalledWith([100, 555, 777]);
    expect(res.processes.map((p) => p.pid).sort((a, b) => a - b)).toEqual([100, 555, 777]);
    // fgPid stays the direct foreground child (childPids[0]) — unchanged meaning.
    expect(res.fgPid).toBe(555);
    expect(res.panePid).toBe(100);
  });

  it('fgPid is null when there are no direct children, even if processes[] is non-empty', async () => {
    const tmux = makeTmux({
      panePid: async () => 100,
      childPids: async () => [],
      descendantPids: async () => [],
      psRows: async () => [{ pid: 100, ppid: 1, stat: 'S', command: 'zsh' }],
    });
    const ctx = makeContext({ tmux });
    const res = await termPs(asContext(ctx), { terminalId: toTerminalId('t01') });

    expect(res.fgPid).toBeNull();
    expect(res.processes).toEqual([{ pid: 100, ppid: 1, stat: 'S', command: 'zsh' }]);
  });
});
