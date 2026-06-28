/**
 * resize-invariant.e2e.spec.ts — AC #8 / FM#2.
 *
 * Proves: a headless attach (simulated by opening a second TmuxClient against
 * the same socket without specifying a size) does NOT change the session's
 * pinned #{window_width}. The broker pins size at session creation via
 * `set-option -g default-size 120x30`; subsequent attaches must not
 * renegotiate the session smaller (the resize-war footgun from _invariants.md).
 *
 * The invariant: NEVER let a headless attach renegotiate the session smaller
 * than the human's viewport (_invariants.md NEVER #3).
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termSnapshot } from '../ddx-term-mcp/src/tools/term-snapshot.tool.js';
import { TmuxClient } from '../ddx-term-mcp/src/tmux/tmux.client.js';
import { TmuxSandbox, tmuxAvailable, SANDBOX_COLS, SANDBOX_LINES } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)('resize invariant — AC #8 / FM#2', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-resize');
    await termCreate(sandbox.ctx, { name: 'view' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('session is created with the pinned dimensions', async () => {
    const resolved = await sandbox.ctx.resolver.resolve(toTerminalId('view'));
    const dims = await sandbox.tmux.paneDimensions(resolved.windowId);
    expect(dims.cols, 'pinned cols should match SANDBOX_COLS').toBe(SANDBOX_COLS);
    expect(dims.lines, 'pinned lines should match SANDBOX_LINES').toBe(SANDBOX_LINES);
  });

  it('a second TmuxClient attaching to the same socket does NOT change window_width', async () => {
    const resolved = await sandbox.ctx.resolver.resolve(toTerminalId('view'));

    // Measure dimensions before a second client opens.
    const before = await sandbox.tmux.paneDimensions(resolved.windowId);
    expect(before.cols).toBe(SANDBOX_COLS);

    // Simulate a headless attach: open a second TmuxClient on the same socket.
    // It reads state but does NOT create a new session or pass size arguments.
    const secondClient = new TmuxClient({ socket: sandbox.socket, session: sandbox.session });

    // The second client reads the window list — this is what a headless agent attach does.
    const windows = await secondClient.listWindows();
    expect(windows.length, 'second client should see the windows').toBeGreaterThan(0);

    // Dimensions must be unchanged after the second client accessed the session.
    const after = await sandbox.tmux.paneDimensions(resolved.windowId);
    expect(after.cols, 'width must not change after headless attach').toBe(before.cols);
    expect(after.lines, 'height must not change after headless attach').toBe(before.lines);
  });

  it('term_snapshot reports the pinned grid dimensions', async () => {
    const snap = await termSnapshot(sandbox.ctx, { terminalId: toTerminalId('view') });
    expect(snap.cols, 'snapshot cols must match pinned size').toBe(SANDBOX_COLS);
    expect(snap.lines, 'snapshot lines must match pinned size').toBe(SANDBOX_LINES);
  });
});
