/**
 * statefulness.e2e.spec.ts — AC #4.
 *
 * Proves shell state is preserved across separate verb calls:
 *   1. `cd /tmp` then `pwd` across separate termSend calls → prints /tmp
 *   2. Open a python3 REPL, assign a variable, eval it in the next call → persists
 *
 * The PTY is a long-lived shell process; each send-keys is a keystroke into the
 * same running shell, so cwd and REPL state survive between calls.
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

describe.skipIf(!HAS_TMUX)('statefulness — AC #4', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-state');
    await termCreate(sandbox.ctx, { name: 'shell' });
    await termCreate(sandbox.ctx, { name: 'repl' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('cd /tmp then pwd across separate calls preserves cwd', async () => {
    // Call 1: change directory.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('shell'),
      text: 'cd /tmp',
      enter: true,
    });

    // Call 2 (separate): print cwd.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('shell'),
      text: 'pwd',
      enter: true,
    });

    // Wait for /tmp to appear in the output.
    const waited = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('shell'),
      pattern: '/tmp',
      timeoutMs: 5000,
    });
    expect(waited.matched, 'pwd should print /tmp after cd').toBe(true);

    const read = await termRead(sandbox.ctx, { terminalId: toTerminalId('shell'), since: 'all' });
    expect(read.text).toContain('/tmp');
  });

  it('python3 REPL persists variable across separate send calls', async () => {
    // Start the REPL.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      text: 'python3',
      enter: true,
    });

    // Wait for the interactive prompt (>>>).
    const promptWait = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      pattern: '>>>',
      timeoutMs: 8000,
    });
    expect(promptWait.matched, 'python3 REPL should show >>> prompt').toBe(true);

    // Call 1: assign variable.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      text: 'x = 42',
      enter: true,
    });

    // Wait for the next prompt before sending the next statement.
    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      pattern: '>>>',
      timeoutMs: 4000,
    });

    // Call 2 (separate): eval the variable.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      text: 'print(x)',
      enter: true,
    });

    // The REPL should print 42 — proving state persisted across calls.
    const waited = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      pattern: '42',
      timeoutMs: 5000,
    });
    expect(waited.matched, 'python3 should print 42 proving variable persistence').toBe(true);

    // Exit the REPL cleanly.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('repl'),
      text: 'exit()',
      enter: true,
    });
  });
});
