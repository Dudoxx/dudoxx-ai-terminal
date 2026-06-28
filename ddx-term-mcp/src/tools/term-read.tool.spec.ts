/**
 * term-read.tool.spec.ts — the delta-by-default contract (FM#3).
 *
 * Asserts: a second read returns only the lines added since the first (delta);
 * since='all' returns the full capture and resets the cursor; the capture path
 * uses scrollback (-S -N), never the visible-only viewport.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termRead } from './term-read.tool.js';
import { asContext, makeContext, makeTmux } from './_test-helpers.js';

function buffer(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
}

describe('term_read', () => {
  it('returns the delta on the second read of a growing buffer', async () => {
    let lines = 1000;
    const tmux = makeTmux({ capturePaneScrollback: async () => buffer(lines) });
    const ctx = makeContext({ tmux });

    const first = await termRead(asContext(ctx), { terminalId: toTerminalId('t01'), since: 'last' });
    // First read consumes the whole 1000-line buffer.
    expect(first.text.split('\n')).toHaveLength(1000);

    // Buffer grows by 3 lines; second read returns ONLY the 3 new lines.
    lines = 1003;
    const second = await termRead(asContext(ctx), { terminalId: toTerminalId('t01'), since: 'last' });
    expect(second.text).toBe('line 1001\nline 1002\nline 1003');
  });

  it('uses scrollback capture (-S -N), not the visible viewport', async () => {
    const tmux = makeTmux({ capturePaneScrollback: async () => buffer(5) });
    const ctx = makeContext({ tmux });
    await termRead(asContext(ctx), { since: 'last' });
    expect(ctx.tmux.capturePaneScrollback).toHaveBeenCalled();
    expect(ctx.tmux.capturePaneVisible).not.toHaveBeenCalled();
  });

  it('since="all" returns the full capture and resets the cursor', async () => {
    const tmux = makeTmux({ capturePaneScrollback: async () => buffer(4) });
    const ctx = makeContext({ tmux });
    const all = await termRead(asContext(ctx), { since: 'all' });
    expect(all.text.split('\n')).toHaveLength(4);
    // After a full read, the next 'last' delta is empty (cursor at tail).
    const next = await termRead(asContext(ctx), { since: 'last' });
    expect(next.text).toBe('');
  });

  it('caps the capture by DDX_TERM_MAX_READ_LINES and marks truncated', async () => {
    const tmux = makeTmux({ capturePaneScrollback: async () => buffer(50) });
    const ctx = makeContext({ tmux, config: { maxReadLines: 10 } });
    const res = await termRead(asContext(ctx), { since: 'all' });
    expect(res.text.split('\n')).toHaveLength(10);
    expect(res.truncated).toBe(true);
  });
});
