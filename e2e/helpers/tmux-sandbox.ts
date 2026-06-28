/**
 * tmux-sandbox.ts — throwaway tmux session on a TEMP socket for e2e tests.
 *
 * Every e2e test creates a TmuxSandbox which:
 *   - allocates a unique temp directory + private socket path
 *   - boots the session with `tmux -f /dev/null` (no user conf) and
 *     `set-option -g default-size 120x30` (NOT window-size manual — SPIKE footgun #1)
 *   - wires a ToolContext (TmuxClient + LocalMapResolver + ReadCursor + AllowList)
 *   - tears itself down (kill-server + rm temp dir) in destroy()
 *
 * HARD RULES (_invariants.md):
 *   - NEVER inherit the user's ~/.tmux.conf — always -f /dev/null
 *   - NEVER use window-size manual — use default-size (production-day-1 crash)
 *   - ALWAYS kill the session + remove the socket in teardown (no leaks)
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { toTerminalId } from '@ddx/term-contract';

import { AllowList } from '../../ddx-term-mcp/src/allow-list.js';
import { ReadCursor } from '../../ddx-term-mcp/src/read-cursor.js';
import { LocalMapResolver } from '../../ddx-term-mcp/src/registry-resolver.js';
import { TerminalMap } from '../../ddx-term-mcp/src/terminal-map.js';
import { TmuxClient } from '../../ddx-term-mcp/src/tmux/tmux.client.js';
import { makeConfig } from '../../ddx-term-mcp/src/tools/_test-helpers.js';
import type { ToolContext } from '../../ddx-term-mcp/src/context.js';

export const SANDBOX_COLS = 120;
export const SANDBOX_LINES = 30;

/** A self-contained tmux environment for one e2e test suite. */
export class TmuxSandbox {
  readonly session: string;
  readonly socket: string;
  readonly tmux: TmuxClient;
  readonly ctx: ToolContext;

  private readonly workDir: string;

  private constructor(session: string, workDir: string, socket: string, tmux: TmuxClient, ctx: ToolContext) {
    this.session = session;
    this.workDir = workDir;
    this.socket = socket;
    this.tmux = tmux;
    this.ctx = ctx;
  }

  /**
   * Boot a fresh throwaway tmux session on a private socket.
   * Throws if tmux is not on PATH (callers should skip via `tmuxAvailable()`).
   */
  static async create(sessionName: string): Promise<TmuxSandbox> {
    const workDir = mkdtempSync(join(tmpdir(), `ddx-e2e-${sessionName}-`));
    const socket = join(workDir, 'e2e.sock');
    const tmux = new TmuxClient({ socket, session: sessionName });
    // Boot: -f /dev/null prevents ~/.tmux.conf interference (_invariants.md MUST #1)
    // default-size NOT window-size manual (_invariants.md NEVER #1 — SPIKE footgun)
    await tmux.newSession(SANDBOX_COLS, SANDBOX_LINES);
    const ctx: ToolContext = {
      tmux,
      resolver: new LocalMapResolver(tmux, new TerminalMap()),
      cursor: new ReadCursor(),
      allowList: AllowList.fromPath(undefined),
      config: makeConfig({ socket, session: sessionName, defaultTerminal: toTerminalId('t01') }),
    };
    return new TmuxSandbox(sessionName, workDir, socket, tmux, ctx);
  }

  /**
   * Tear down: kill the server (removes socket) and delete the temp dir.
   * Best-effort — never throws so afterAll hooks stay clean.
   */
  async destroy(): Promise<void> {
    try {
      await this.tmux.killServer();
    } catch {
      // already gone — teardown is best-effort
    }
    try {
      rmSync(this.workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * True when the `tmux` binary is available on PATH.
 * E2E suites call `describe.skipIf(!tmuxAvailable())` to self-skip in CI.
 */
export function tmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute p50 and p95 for an array of durations (milliseconds).
 * Used by the latency e2e to assert AC #1 / RESPONSIVENESS §4.
 */
export function percentiles(samples: readonly number[]): { p50: number; p95: number } {
  if (samples.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { p50, p95 };
}
