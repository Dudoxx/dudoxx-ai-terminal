/**
 * control-mode.attach.ts — spawns `tmux -CC attach` and feeds lines to the parser.
 *
 * tmux control mode (`-CC`) emits a newline-delimited, machine-parseable protocol
 * instead of raw VT100 escapes. This is the keystone (ARCHITECTURE §3): it enables
 * structured pane/window events that the WS gateway fans out per terminalId.
 *
 * RESPONSIVENESS §2.2 — we forward bytes INCREMENTALLY as lines arrive; we never
 * buffer whole screens. The line-reader splits on '\n' and passes each complete
 * line to parseControlModeLine immediately.
 *
 * The attach process is long-lived (reconnect loop). If tmux exits unexpectedly
 * the service re-attaches after a short backoff, preserving the session (AC #5).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { existsSync } from 'node:fs';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as pty from 'node-pty';
import { parseControlModeLine, type FrameResolvers } from './control-mode.parser';
import type { ServerFrame, WindowId, TerminalId } from '@ddx/term-contract';

const SESSION_NAME = process.env['DDX_TERM_SESSION'] ?? 'ddx-shared';
const SOCKET_PATH = process.env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock';

/** Base reconnect delay (ms); grows with exponential backoff up to the cap. */
const RECONNECT_BASE_DELAY_MS = 2000;
/** Ceiling for a single backoff wait (ms) — avoids multi-minute silent stalls. */
const RECONNECT_MAX_DELAY_MS = 30_000;
/**
 * Max consecutive attach failures before the loop gives up. A persistently
 * failing `pty.spawn` (e.g. a missing native `pty.node` in a bundled deploy)
 * would otherwise retry every 2s FOREVER, leaking a pty per cycle until macOS
 * exhausts `kern.tty.ptmx_max` (511) and NO process can allocate a pty. Mirrors
 * the web client's RECONNECT_MAX_ATTEMPTS=60 (xterm-client.ts). A clean exit
 * (tmux killed / session gone) resets the counter — only unbroken failures count.
 */
const RECONNECT_MAX_ATTEMPTS = 60;

/**
 * Resolve the tmux binary to an ABSOLUTE path. node-pty's posix_spawnp does not
 * reliably honour PATH (it failed with `posix_spawnp failed` when given bare
 * 'tmux'), so we probe the common install locations + $DDX_TERM_TMUX_BIN.
 */
function resolveTmuxBin(): string {
  const candidates = [
    process.env['DDX_TERM_TMUX_BIN'],
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return candidates.find((p) => existsSync(p)) ?? 'tmux';
}

const TMUX_BIN = resolveTmuxBin();

export type FrameHandler = (frame: ServerFrame) => void;

@Injectable()
export class ControlModeAttach implements OnModuleDestroy {
  private readonly logger = new Logger(ControlModeAttach.name);

  private proc: pty.IPty | null = null;
  private handler: FrameHandler | null = null;
  private resolvers: FrameResolvers | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive failed attach attempts; reset to 0 on a healthy data frame. */
  private failedAttempts = 0;

  /**
   * Start the control-mode attach loop.
   * @param resolvers  pane + window → terminalId resolvers (SessionService registry)
   * @param handler    called for every typed ServerFrame produced by the parser
   */
  start(resolvers: FrameResolvers, handler: FrameHandler): void {
    if (this.proc) {
      this.logger.warn('ControlModeAttach already running — ignoring duplicate start()');
      return;
    }
    this.resolvers = resolvers;
    this.handler = handler;
    this.stopped = false;
    this.spawn();
  }

  /** Stop the attach loop — called on module destroy. */
  stop(): void {
    this.stopped = true;
    this.failedAttempts = 0;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disposeProc();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  // ── private ────────────────────────────────────────────────────────────────

  /**
   * Deterministically release the current pty master fd.
   *
   * node-pty allocates a REAL `/dev/ptmx` master per `pty.spawn`. Dropping the JS
   * reference (`this.proc = null`) alone does NOT release that fd — it lingers until
   * the GC *maybe* runs node-pty's finalizer, which under a long-lived low-GC-pressure
   * process effectively never happens. Over a multi-day reconnect churn this leaks one
   * master per cycle until macOS `kern.tty.ptmx_max` (511) is exhausted and NO process
   * on the machine can allocate a pty (observed: a stale broker held 510 masters,
   * killing `zpty`/shell autosuggest host-wide). `.kill()` is the only deterministic
   * release. Idempotent — safe to call when `this.proc` is already null.
   */
  private disposeProc(): void {
    if (!this.proc) return;
    try {
      this.proc.kill();
    } catch {
      // Already-exited pty throws EBADF/ESRCH on kill — the fd is gone, which is the
      // outcome we want. Swallow so cleanup on the exit path never re-enters the loop.
    }
    this.proc = null;
  }

  private spawn(): void {
    if (this.stopped) return;

    // Reap any prior pty before allocating a new one. `spawn()` is re-entered from
    // scheduleReconnect() after a successful-then-exited attach; without this the
    // previous master fd leaks every reconnect cycle (the fd IS released in onExit
    // below, but this is the belt-and-braces guard against any path that reaches
    // spawn() with a live proc still assigned).
    this.disposeProc();

    // tmux -f /dev/null -S $SOCK -CC attach-session -t ddx-shared -r
    // -r = read-only attach so we don't steal input from the human.
    // -f /dev/null prevents config inheritance (SPIKE footgun #2).
    const args = [
      '-f', '/dev/null',
      '-S', SOCKET_PATH,
      '-CC',
      'attach-session',
      '-t', SESSION_NAME,
      '-r',
    ];

    this.logger.log(`Spawning (pty): ${TMUX_BIN} ${args.join(' ')}`);

    // tmux -CC attach REQUIRES a controlling TTY (it calls tcgetattr on stdin).
    // child_process.spawn gives no pty → `tcgetattr failed` → exit 1 crash-loop.
    // node-pty allocates a real pseudo-terminal so the attach succeeds. This pty
    // lives in the BROKER only — the no-PTY invariant applies to ddx-term-mcp, not
    // the broker, which legitimately hosts the control-mode attach (SPIKE used a
    // real TTY from iTerm2 for the same reason). Use the ABSOLUTE tmux path —
    // node-pty's posix_spawnp does not reliably resolve PATH.
    let proc: pty.IPty;
    try {
      proc = pty.spawn(TMUX_BIN, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: process.env['HOME'] ?? '/',
        env: { ...process.env } as Record<string, string>,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.proc = null;
      // Failed to even allocate the pty — count it and back off (or give up).
      this.scheduleReconnect(`pty.spawn(${TMUX_BIN}) failed: ${msg}`);
      return;
    }
    this.proc = proc;

    let lineBuf = '';

    // node-pty merges stdout+stderr onto one data stream (it's a real terminal).
    proc.onData((chunk: string) => {
      // First bytes prove the attach is live — a healthy attach clears the
      // consecutive-failure counter so a later transient drop gets a fresh
      // budget of RECONNECT_MAX_ATTEMPTS rather than inheriting stale count.
      if (this.failedAttempts !== 0) this.failedAttempts = 0;
      lineBuf += chunk;
      let newline: number;
      // Process every complete line immediately — incremental, not buffered.
      while ((newline = lineBuf.indexOf('\n')) !== -1) {
        let line = lineBuf.slice(0, newline);
        lineBuf = lineBuf.slice(newline + 1);
        // The control-mode stream runs through a PTY whose ONLCR maps the
        // protocol's `\n` line terminator to `\r\n`. Splitting on `\n` leaves a
        // trailing `\r` on each line; for an `%output` line that stray CR becomes
        // a real carriage-return appended to the pane data, snapping the browser
        // cursor to column 0 and garbling every live keystroke echo. Strip it.
        if (line.endsWith('\r')) line = line.slice(0, -1);
        this.handleLine(line);
      }
    });

    proc.onExit(({ exitCode, signal }) => {
      // Release the master fd of the pty that just exited BEFORE reconnecting.
      // node-pty does not free the `/dev/ptmx` master on exit unless kill() runs;
      // on a success→exit→reconnect churn this is the primary leak site (the loop
      // never trips the failure-cap because a healthy data frame reset it to 0).
      // disposeProc() is guarded against the already-exited EBADF and nulls this.proc.
      if (this.proc === proc) this.disposeProc();
      if (this.stopped) return;
      this.scheduleReconnect(
        `tmux -CC attach exited (code=${String(exitCode)} signal=${String(signal)})`,
      );
    });
  }

  /**
   * Schedule the next attach attempt with a capped, exponentially-backed-off
   * delay — or STOP the loop once RECONNECT_MAX_ATTEMPTS consecutive failures
   * have accrued. This is the pty-leak circuit-breaker: without the cap a
   * persistently-failing spawn retries every 2s forever, leaking one pty per
   * cycle until the macOS pty pool is exhausted. Callers pass a reason string
   * for the log line; they have already nulled `this.proc`.
   */
  private scheduleReconnect(reason: string): void {
    if (this.stopped) return;

    this.failedAttempts += 1;
    if (this.failedAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.logger.error(
        `${reason} — giving up after ${RECONNECT_MAX_ATTEMPTS} consecutive failures. ` +
          `Control-mode attach is DOWN; restart the broker once the underlying tmux/pty fault is fixed.`,
      );
      this.stopped = true;
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, … capped at RECONNECT_MAX_DELAY_MS.
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (this.failedAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    this.logger.warn(
      `${reason} — reconnecting in ${delay}ms ` +
        `(attempt ${this.failedAttempts}/${RECONNECT_MAX_ATTEMPTS})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.spawn();
    }, delay);
  }

  private handleLine(line: string): void {
    if (!line || !this.resolvers || !this.handler) return;

    const result = parseControlModeLine(line, this.resolvers);
    if (result.kind === 'frame') {
      this.handler(result.frame);
    }
  }

  /** Resolve a windowId using the currently registered window resolver. */
  resolveWindowId(windowId: WindowId): TerminalId | undefined {
    return this.resolvers?.resolveWindow(windowId);
  }
}
