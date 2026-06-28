/**
 * multi-terminal-isolation.e2e.spec.ts — AC #12.
 *
 * Proves: creating terminals 'a' and 'b' in the same session; sending to 'a'
 * does NOT appear in 'b'. The shared-session model must isolate terminals
 * (windows) so one agent's output never bleeds into another terminal's read.
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termRead } from '../ddx-term-mcp/src/tools/term-read.tool.js';
import { termSend } from '../ddx-term-mcp/src/tools/term-send.tool.js';
import { termWaitFor } from '../ddx-term-mcp/src/tools/term-wait-for.tool.js';
import { TmuxSandbox, tmuxAvailable } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)('multi-terminal isolation — AC #12', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-isolation');
    // Create two independent terminals in the same session.
    await termCreate(sandbox.ctx, { name: 'a' });
    await termCreate(sandbox.ctx, { name: 'b' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('output sent to terminal a is NOT visible in terminal b', async () => {
    const marker = `ISOLATION_MARKER_A_${Date.now()}`;

    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('a'),
      text: `echo ${marker}`,
      enter: true,
    });

    // Wait until terminal 'a' has the marker (deterministic, replaces sleep).
    const waited = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('a'),
      pattern: marker,
      timeoutMs: 6000,
    });
    expect(waited.matched, 'terminal a should show the marker').toBe(true);

    // Full read of terminal 'a' must contain the marker.
    const readA = await termRead(sandbox.ctx, { terminalId: toTerminalId('a'), since: 'all' });
    expect(readA.text, 'terminal a read must contain the marker').toContain(marker);

    // Full read of terminal 'b' must NOT contain the marker — isolation proof.
    const readB = await termRead(sandbox.ctx, { terminalId: toTerminalId('b'), since: 'all' });
    expect(readB.text, 'terminal b read must be free of terminal a output').not.toContain(marker);
  });

  it('output sent to terminal b is NOT visible in terminal a', async () => {
    const marker = `ISOLATION_MARKER_B_${Date.now()}`;

    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('b'),
      text: `echo ${marker}`,
      enter: true,
    });

    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('b'),
      pattern: marker,
      timeoutMs: 6000,
    });

    // Reset cursor on 'a' to get a clean delta baseline.
    await termRead(sandbox.ctx, { terminalId: toTerminalId('a'), since: 'all' });

    // Terminal 'a' must still have no trace of 'b's marker.
    const readA = await termRead(sandbox.ctx, { terminalId: toTerminalId('a'), since: 'last' });
    expect(readA.text, 'terminal a must not see terminal b output').not.toContain(marker);
  });
});
