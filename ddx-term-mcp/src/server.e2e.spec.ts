/**
 * server.e2e.spec.ts — standalone e2e against a REAL tmux on a TEMP socket.
 *
 * Proves the verbs work end-to-end without the broker, against a throwaway tmux
 * session on a private socket (NEVER the user's tmux server). Asserts the load-
 * bearing properties: multi-terminal isolation (send to 'a' is invisible to 'b'),
 * delta reads, and the terminalId ≠ pid signal-validation. The session+socket are
 * killed in teardown.
 *
 * Skips automatically when `tmux` is not on PATH (CI without tmux).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { LocalMapResolver } from './registry-resolver.js';
import { ReadCursor } from './read-cursor.js';
import { AllowList } from './allow-list.js';
import { TerminalMap } from './terminal-map.js';
import { TmuxClient } from './tmux/tmux.client.js';
import { makeConfig } from './tools/_test-helpers.js';
import type { ToolContext } from './context.js';
import { termCreate } from './tools/term-create.tool.js';
import { termSend } from './tools/term-send.tool.js';
import { termRead } from './tools/term-read.tool.js';
import { termSignal } from './tools/term-signal.tool.js';
import { termWaitFor } from './tools/term-wait-for.tool.js';

function tmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_TMUX = tmuxAvailable();
const SESSION = 'ddx-e2e';

let workDir: string;
let socket: string;
let tmux: TmuxClient;
let ctx: ToolContext;

describe.skipIf(!HAS_TMUX)('ddx-term-mcp standalone e2e (real tmux, temp socket)', () => {
  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'ddx-term-e2e-'));
    socket = join(workDir, 'e2e.sock');
    tmux = new TmuxClient({ socket, session: SESSION });
    await tmux.newSession(120, 30);
    ctx = {
      tmux,
      resolver: new LocalMapResolver(tmux, new TerminalMap()),
      cursor: new ReadCursor(),
      allowList: AllowList.fromPath(undefined),
      config: makeConfig({ socket, session: SESSION, defaultTerminal: toTerminalId('t01') }),
    };
  });

  afterAll(() => {
    try {
      tmux.killServer().catch(() => undefined);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('creates two terminals with distinct windowIds', async () => {
    const a = await termCreate(ctx, { name: 'a' });
    const b = await termCreate(ctx, { name: 'b' });
    expect(a.terminalId).toBe(toTerminalId('a'));
    expect(b.terminalId).toBe(toTerminalId('b'));
    expect(a.windowId).not.toBe(b.windowId);
    expect(a.created).toBe(true);
  });

  it('term_create is idempotent on an existing slug', async () => {
    const again = await termCreate(ctx, { name: 'a' });
    expect(again.created).toBe(false);
    expect(again.terminalId).toBe(toTerminalId('a'));
  });

  it('isolation: send to "a" is visible in "a" and NOT in "b"', async () => {
    await termSend(ctx, { terminalId: toTerminalId('a'), text: 'echo HELLO_FROM_A', enter: true });
    // Wait for the marker to appear in a (deterministic, replaces a sleep).
    const waited = await termWaitFor(ctx, { terminalId: toTerminalId('a'), pattern: 'HELLO_FROM_A', timeoutMs: 5000 });
    expect(waited.matched).toBe(true);

    const readA = await termRead(ctx, { terminalId: toTerminalId('a'), since: 'all' });
    expect(readA.text).toContain('HELLO_FROM_A');

    const readB = await termRead(ctx, { terminalId: toTerminalId('b'), since: 'all' });
    expect(readB.text).not.toContain('HELLO_FROM_A');
  });

  it('delta read: a second since="last" returns only new output', async () => {
    // Reset cursor to current tail with a full read.
    await termRead(ctx, { terminalId: toTerminalId('a'), since: 'all' });
    await termSend(ctx, { terminalId: toTerminalId('a'), text: 'echo DELTA_MARKER_42', enter: true });
    await termWaitFor(ctx, { terminalId: toTerminalId('a'), pattern: 'DELTA_MARKER_42', timeoutMs: 5000 });

    const delta = await termRead(ctx, { terminalId: toTerminalId('a'), since: 'last' });
    expect(delta.text).toContain('DELTA_MARKER_42');
    // The delta must NOT re-include the earlier HELLO marker.
    expect(delta.text).not.toContain('HELLO_FROM_A');
  });

  it('terminalId ≠ pid: signalling a foreign pid is rejected (PID_NOT_IN_TERMINAL)', async () => {
    // pid 1 (init) is never in a terminal's process tree.
    await expect(
      termSignal(ctx, { terminalId: toTerminalId('a'), signal: 'C-c', pid: 1 }),
    ).rejects.toMatchObject({ code: 'PID_NOT_IN_TERMINAL' });
  });
});
