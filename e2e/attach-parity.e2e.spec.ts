/**
 * attach-parity.e2e.spec.ts — 3-way attach parity (AC #2/#3, FM#1).
 *
 * Proves: term_send injects keystrokes into the shared tmux session, and a
 * SECOND capture-pane client (simulating a web attach) reads the same bytes.
 * This is the core thesis: agent acts → human sees it, same PTY, no custom code.
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termSend } from '../ddx-term-mcp/src/tools/term-send.tool.js';
import { termWaitFor } from '../ddx-term-mcp/src/tools/term-wait-for.tool.js';
import { TmuxSandbox, tmuxAvailable } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)('attach parity — AC #2/#3', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-attach');
    await termCreate(sandbox.ctx, { name: 'main' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('term_send output is visible via a second capture-pane client', async () => {
    const marker = `ATTACH_PARITY_${Date.now()}`;
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('main'),
      text: `echo ${marker}`,
      enter: true,
    });

    // Primary client: term_wait_for polls until the marker appears.
    const waited = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('main'),
      pattern: marker,
      timeoutMs: 6000,
    });
    expect(waited.matched, 'primary wait_for should see the marker').toBe(true);

    // Second client path: raw TmuxClient.capturePaneVisible on the same window —
    // simulates a web browser's attach view reading the same PTY bytes.
    const win = sandbox.ctx.resolver;
    const resolved = await win.resolve(toTerminalId('main'));
    const secondCapture = await sandbox.tmux.capturePaneVisible(resolved.windowId, false);
    expect(secondCapture, 'second capture-pane client must see the same bytes').toContain(marker);
  });

  it('second capture-pane scrollback also contains the marker', async () => {
    const marker2 = `ATTACH_PARITY_SCROLL_${Date.now()}`;
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('main'),
      text: `echo ${marker2}`,
      enter: true,
    });
    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('main'),
      pattern: marker2,
      timeoutMs: 6000,
    });

    const resolved = await sandbox.ctx.resolver.resolve(toTerminalId('main'));
    const scrollback = await sandbox.tmux.capturePaneScrollback(resolved.windowId, 200);
    expect(scrollback, 'scrollback must contain the second marker').toContain(marker2);
  });
});
