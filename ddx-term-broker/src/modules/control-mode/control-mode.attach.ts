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
const RECONNECT_DELAY_MS = 2000;

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
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private spawn(): void {
    if (this.stopped) return;

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
      this.logger.error(`pty.spawn(${TMUX_BIN}) failed: ${msg} — retrying in ${RECONNECT_DELAY_MS}ms`);
      this.proc = null;
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.spawn();
        }, RECONNECT_DELAY_MS);
      }
      return;
    }
    this.proc = proc;

    let lineBuf = '';

    // node-pty merges stdout+stderr onto one data stream (it's a real terminal).
    proc.onData((chunk: string) => {
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
      this.proc = null;
      if (this.stopped) return;
      this.logger.warn(
        `tmux -CC attach exited (code=${String(exitCode)} signal=${String(signal)}) — reconnecting in ${RECONNECT_DELAY_MS}ms`,
      );
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.spawn();
      }, RECONNECT_DELAY_MS);
    });
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
