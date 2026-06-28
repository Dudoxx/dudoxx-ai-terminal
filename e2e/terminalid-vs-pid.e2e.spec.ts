/**
 * terminalid-vs-pid.e2e.spec.ts — AC #14 / FM#4.
 *
 * Proves the terminalId ≠ pid invariant (_invariants.md MUST #3/#4):
 *   - term_signal(pid=foreign) → throws PID_NOT_IN_TERMINAL
 *   - term_signal on the REAL foreground pid of a running command succeeds
 *
 * The two identities are distinct: terminalId is stable and addresses the
 * window; pid is transient and scoped to the process tree of that window.
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termSend } from '../ddx-term-mcp/src/tools/term-send.tool.js';
import { termSignal } from '../ddx-term-mcp/src/tools/term-signal.tool.js';
import { termWaitFor } from '../ddx-term-mcp/src/tools/term-wait-for.tool.js';
import { TmuxSandbox, tmuxAvailable } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)('terminalId vs pid — AC #14 / FM#4', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-pid');
    await termCreate(sandbox.ctx, { name: 'sig' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('term_signal with a foreign pid throws PID_NOT_IN_TERMINAL', async () => {
    // pid 1 (launchd/init) is never in a terminal's process tree.
    await expect(
      termSignal(sandbox.ctx, { terminalId: toTerminalId('sig'), signal: 'C-c', pid: 1 }),
    ).rejects.toMatchObject({ code: 'PID_NOT_IN_TERMINAL' });
  });

  it('term_signal with an arbitrary foreign pid also rejects', async () => {
    // pid 2 is also always outside any terminal process tree.
    await expect(
      termSignal(sandbox.ctx, { terminalId: toTerminalId('sig'), signal: 'C-c', pid: 2 }),
    ).rejects.toMatchObject({ code: 'PID_NOT_IN_TERMINAL' });
  });

  it('term_signal on the real foreground pid of a running command succeeds', async () => {
    // Start a long sleep as the foreground process in the terminal.
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('sig'),
      text: 'sleep 60',
      enter: true,
    });

    // Wait until the visible pane shows the sleep command has been echoed/started.
    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('sig'),
      pattern: 'sleep',
      timeoutMs: 4000,
    });

    // Poll childPids until the sleep process appears in the process tree.
    // pgrep races process creation — give it up to 2 s after the pane shows "sleep".
    const resolved = await sandbox.ctx.resolver.resolve(toTerminalId('sig'));
    const panePid = await sandbox.tmux.panePid(resolved.windowId);

    let freshChildren: number[] = [];
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      freshChildren = await sandbox.tmux.childPids(panePid);
      if (freshChildren.length > 0) break;
      await new Promise<void>((r) => setTimeout(r, 50));
    }

    expect(freshChildren.length, 'sleep should be a child of the pane shell').toBeGreaterThan(0);

    const sleepPid = freshChildren[0];
    if (sleepPid === undefined) throw new Error('no child pid found');

    // Signalling the real child pid must succeed (TERM signal kills sleep).
    const result = await termSignal(sandbox.ctx, {
      terminalId: toTerminalId('sig'),
      signal: 'C-c',
      pid: sleepPid,
    });
    expect(result.ok).toBe(true);
    expect(result.targetedPid).toBe(sleepPid);
  });
});
