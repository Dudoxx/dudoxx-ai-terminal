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

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcess } from 'child_process';
import { parseControlModeLine, type WindowIdResolver } from './control-mode.parser';
import type { ServerFrame, WindowId, TerminalId } from '@ddx/term-contract';

const SESSION_NAME = process.env['DDX_TERM_SESSION'] ?? 'ddx-shared';
const SOCKET_PATH = process.env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock';
const RECONNECT_DELAY_MS = 2000;

export type FrameHandler = (frame: ServerFrame) => void;

@Injectable()
export class ControlModeAttach implements OnModuleDestroy {
  private readonly logger = new Logger(ControlModeAttach.name);

  private proc: ChildProcess | null = null;
  private handler: FrameHandler | null = null;
  private resolver: WindowIdResolver | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Start the control-mode attach loop.
   * @param resolver  maps tmux windowId → terminalId (from SessionService registry)
   * @param handler   called for every typed ServerFrame produced by the parser
   */
  start(resolver: WindowIdResolver, handler: FrameHandler): void {
    if (this.proc) {
      this.logger.warn('ControlModeAttach already running — ignoring duplicate start()');
      return;
    }
    this.resolver = resolver;
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
      this.proc.kill('SIGTERM');
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

    this.logger.log(`Spawning: tmux ${args.join(' ')}`);

    const proc = spawn('tmux', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;

    let lineBuf = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuf += chunk.toString('utf8');
      let newline: number;
      // Process every complete line immediately — incremental, not buffered.
      while ((newline = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.slice(0, newline);
        lineBuf = lineBuf.slice(newline + 1);
        this.handleLine(line);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      this.logger.warn(`tmux stderr: ${chunk.toString('utf8').trim()}`);
    });

    proc.on('exit', (code, signal) => {
      this.proc = null;
      if (this.stopped) return;
      this.logger.warn(
        `tmux -CC attach exited (code=${String(code)} signal=${String(signal)}) — reconnecting in ${RECONNECT_DELAY_MS}ms`,
      );
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.spawn();
      }, RECONNECT_DELAY_MS);
    });

    proc.on('error', (err: Error) => {
      this.logger.error(`tmux -CC attach spawn error: ${err.message}`);
      this.proc = null;
      if (this.stopped) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.spawn();
      }, RECONNECT_DELAY_MS);
    });
  }

  private handleLine(line: string): void {
    if (!line || !this.resolver || !this.handler) return;

    const result = parseControlModeLine(line, this.resolver);
    if (result.kind === 'frame') {
      this.handler(result.frame);
    }
  }

  /** Resolve a windowId using the currently registered resolver. */
  resolveWindowId(windowId: WindowId): TerminalId | undefined {
    return this.resolver?.(windowId);
  }
}
