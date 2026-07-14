/**
 * TermGateway — per-terminalId WebSocket fan-out + keystroke ingestion.
 *
 * WS path: /term/:terminalId  (RESPONSIVENESS §2.8 — per-terminal routing).
 * A busy build in terminal A NEVER pushes frames to subscribers of terminal B.
 *
 * Server → client: typed ServerFrame JSON (output, layout-change, window-add,
 *   window-close, error, process-snapshot) — only for the subscribed terminalId.
 * Client → server: InputFrame JSON { type:'input', terminalId, data, enter? }
 *   → resolved to windowId via SessionService → `tmux send-keys -l <data>`.
 *
 * Frame coalescing (RESPONSIVENESS §3): output frames are accumulated over a
 * 16ms window and sent as one JSON payload to cap render frame-rate under flood.
 *
 * Starts the ControlModeAttach loop on onApplicationBootstrap; the attach feeds
 * frames into dispatchFrame() which routes them to the right subscribers.
 *
 * ARCHITECTURE §3 + §5 Flow A.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Server as WsServer, WebSocket } from 'ws';
import {
  type ServerFrame,
  type ClientFrame,
  type SnapshotFrame,
  type TerminalId,
  type WindowId,
  ClientFrameSchema,
} from '@ddx/term-contract';
import { SessionService } from '../session/session.service';
import { ControlModeAttach } from '../control-mode/control-mode.attach';
import { TerminalService } from '../terminal/terminal.service';

const execFileAsync = promisify(execFile);

const SESSION_NAME = process.env['DDX_TERM_SESSION'] ?? 'ddx-shared';
const SOCKET_PATH = process.env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock';
/** Coalesce output frames within this window (ms) before sending. */
const COALESCE_MS = 16;

function tmux(...args: string[]): string[] {
  return ['-S', SOCKET_PATH, ...args];
}

/** One client subscription — a WebSocket scoped to a single terminalId. */
interface Subscription {
  terminalId: TerminalId;
  socket: WebSocket;
}

/** Minimal upgrade-request shape handleConnection reads (IncomingMessage satisfies it). */
interface UpgradeRequest {
  url?: string;
}

/** Pending coalesced output for one terminalId. */
interface CoalesceBuffer {
  data: string;
  timer: ReturnType<typeof setTimeout>;
}

// NOT a @WebSocketGateway. @nestjs/platform-ws's WsAdapter routes upgrades by
// EXACT `pathname === wsServer.path` match (ws-adapter.js ensureHttpServerExists),
// so a registered path of `/term` (or the `/` default when no path is given) can
// NEVER match the client's per-terminal URL `/term/<terminalId>` — the adapter
// calls socket.destroy() ("socket hang up") before handleConnection runs. There is
// no prefix/wildcard mode. So we OWN the upgrade: a raw ws.Server({ noServer:true })
// attached to the Nest HTTP server's `upgrade` event (see attachTo), accepting any
// `/term/<id>` path and parsing the terminalId out of the URL in handleConnection.
@Injectable()
export class TermGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TermGateway.name);

  /** Raw ws.Server in noServer mode — we drive handleUpgrade ourselves. */
  private readonly server: WsServer = new WsServer({ noServer: true });

  /** Map from terminalId → set of subscribed WebSocket clients. */
  private readonly subscribers = new Map<TerminalId, Set<WebSocket>>();

  /** Per-terminalId coalesce buffers (flood control). */
  private readonly coalesce = new Map<TerminalId, CoalesceBuffer>();

  /** All live connections — keyed by socket for quick subscription lookup. */
  private readonly connections = new Map<WebSocket, Subscription>();

  /**
   * Per-terminalId input serialization tail. Browser keystrokes arrive as many
   * separate frames in rapid succession; each one spawns an async `tmux send-keys`
   * subprocess. Without serialization those subprocesses race and land in tmux
   * OUT OF ORDER (typed "TYPING" arrives as "TYPIN_GOK…"). We chain every input
   * for a terminal onto its previous promise so they execute strictly in arrival
   * order. The chain is best-effort — a failed link never breaks the tail.
   */
  private readonly inputQueue = new Map<TerminalId, Promise<void>>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly controlModeAttach: ControlModeAttach,
    private readonly terminalService: TerminalService,
  ) {}

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Attach the raw ws.Server to the Nest HTTP server's `upgrade` event.
   * Called from main.ts AFTER app.listen() so app.getHttpServer() is the real,
   * listening server. Routes any `/term/<terminalId>` upgrade to handleConnection;
   * destroys upgrades on other paths.
   */
  attachTo(httpServer: HttpServer): void {
    httpServer.on(
      'upgrade',
      (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        const url = req.url ?? '';
        if (!/^\/term\/[^/?]+/.test(url)) {
          socket.destroy();
          return;
        }
        this.server.handleUpgrade(req, socket, head, (ws: WebSocket): void => {
          this.handleConnection(ws, req);
        });
      },
    );
    this.server.on('error', (err: Error): void => {
      this.logger.error(`ws.Server error: ${err.message}`);
    });
    this.logger.log('TermGateway attached to HTTP upgrade on /term/:terminalId');
  }

  onApplicationBootstrap(): void {
    // Start the control-mode attach loop with BOTH resolvers:
    //   - resolvePane:   paneId ('%N') → terminalId  — for %output (pane-keyed)
    //   - resolveWindow: windowId ('@N') → terminalId — for layout/window events
    // %output is pane-keyed; resolving it against the window registry dropped
    // every frame (pane '%3' ≠ window '@3'). SessionService owns both maps.
    this.controlModeAttach.start(
      {
        resolvePane: (paneId: string) =>
          this.sessionService.resolveTerminalIdByPane(paneId),
        resolveWindow: (windowId: WindowId) =>
          this.sessionService.resolveTerminalId(windowId),
      },
      (frame: ServerFrame) => this.dispatchFrame(frame),
    );
    this.logger.log('Control-mode attach loop started');
  }

  onModuleDestroy(): void {
    // Flush all coalesce timers before shutdown.
    for (const [terminalId, buf] of this.coalesce.entries()) {
      clearTimeout(buf.timer);
      this.flush(terminalId, buf.data);
    }
    this.coalesce.clear();
  }

  handleConnection(socket: WebSocket, req: UpgradeRequest): void {
    // Extract terminalId from the WS URL: /term/<terminalId>
    const url = req.url ?? '';
    const match = /^\/term\/([^/?]+)/.exec(url);
    if (!match || !match[1]) {
      this.logger.warn(`WS connection rejected — no terminalId in URL: ${url}`);
      socket.close(1008, 'Missing terminalId');
      return;
    }
    const terminalId = match[1] as TerminalId;

    // Register subscription.
    if (!this.subscribers.has(terminalId)) {
      this.subscribers.set(terminalId, new Set());
    }
    const subs = this.subscribers.get(terminalId) ?? new Set<WebSocket>();
    subs.add(socket);
    this.subscribers.set(terminalId, subs);
    this.connections.set(socket, { terminalId, socket });
    this.logger.log(`Client subscribed to terminalId=${terminalId}`);

    socket.on('message', (raw: Buffer | string) => {
      this.handleClientMessage(socket, raw.toString());
    });
    // We own the upgrade now, so we also own disconnect cleanup (no adapter).
    socket.on('close', () => {
      this.handleDisconnect(socket);
    });

    // Cold-attach repaint (AC4.1/4.2): push ONE snapshot frame carrying the
    // current screen + bounded scrollback so a fresh WS open (deep-linked
    // page load) restores its output without a REST round-trip. Fired
    // immediately after subscribing — the socket is already registered so
    // any live %output arriving mid-capture would be a race, but there is no
    // yield point between `subs.add(socket)` above and the awaited capture
    // starting; dispatchFrame's own delivery is still async I/O (control-mode
    // attach loop → parser → dispatchFrame), so this snapshot capture+send
    // reaches the socket first in practice. Any terminal that vanished
    // between subscribe and capture gets an error frame instead of a throw.
    void this.pushInitialSnapshot(socket, terminalId);
  }

  /**
   * Capture + send the cold-attach snapshot frame for a just-subscribed
   * socket. Isolated so a capture failure (terminal destroyed mid-race)
   * degrades to an error frame rather than an unhandled rejection.
   */
  private async pushInitialSnapshot(
    socket: WebSocket,
    terminalId: TerminalId,
  ): Promise<void> {
    try {
      const result = await this.terminalService.snapshotWithScrollback(
        terminalId,
      );
      if (socket.readyState !== WebSocket.OPEN) return;
      const frame: SnapshotFrame = {
        type: 'snapshot',
        terminalId,
        data: result.content,
        cols: result.cols,
        rows: result.rows,
        withAnsi: true,
        scrollbackLines: result.scrollbackLines,
      };
      socket.send(JSON.stringify(frame));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Initial snapshot failed for terminalId=${terminalId}: ${msg}`,
      );
      if (socket.readyState === WebSocket.OPEN) {
        const frame: ServerFrame = {
          type: 'error',
          terminalId,
          message: `Could not restore snapshot: ${msg}`,
          code: 'SNAPSHOT_FAILED',
        };
        socket.send(JSON.stringify(frame));
      }
    }
  }

  handleDisconnect(socket: WebSocket): void {
    const sub = this.connections.get(socket);
    if (sub) {
      this.subscribers.get(sub.terminalId)?.delete(socket);
      if (this.subscribers.get(sub.terminalId)?.size === 0) {
        this.subscribers.delete(sub.terminalId);
      }
      this.connections.delete(socket);
      this.logger.log(`Client unsubscribed from terminalId=${sub.terminalId}`);
    }
  }

  // ── frame dispatch ────────────────────────────────────────────────────────

  /**
   * Route a ServerFrame to the subscribers of its terminalId ONLY.
   * Output frames are coalesced over COALESCE_MS (flood control).
   * All other frame types are sent immediately.
   */
  dispatchFrame(frame: ServerFrame): void {
    const { terminalId } = frame;

    if (frame.type === 'output') {
      this.coalesceOutput(terminalId, frame.data);
      return;
    }

    const subs = this.subscribers.get(terminalId);
    if (!subs || subs.size === 0) return;

    const payload = JSON.stringify(frame);
    for (const socket of subs) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  // ── input handling ────────────────────────────────────────────────────────

  private handleClientMessage(socket: WebSocket, raw: string): void {
    let parsed: ClientFrame;
    try {
      parsed = ClientFrameSchema.parse(JSON.parse(raw));
    } catch {
      this.logger.warn(`Malformed client frame: ${raw.slice(0, 200)}`);
      return;
    }

    if (parsed.type === 'input') {
      // HIGH-1 — AC#12 isolation: assert the socket's SUBSCRIBED terminalId
      // matches the terminalId in the message body. A client subscribed to
      // terminal A must not inject keystrokes into terminal B.
      const sub = this.connections.get(socket);
      if (!sub || sub.terminalId !== parsed.terminalId) {
        this.logger.warn(
          `terminalId mismatch — socket subscribed to ` +
          `${sub?.terminalId ?? '(none)'}, frame claims ${parsed.terminalId}. ` +
          `Closing socket (1008).`,
        );
        socket.close(1008, 'terminalId mismatch');
        return;
      }
      this.enqueueInput(parsed.terminalId, parsed.data, parsed.enter);
    }
  }

  /**
   * Chain an input frame onto the terminal's serialization tail so concurrent
   * keystroke frames execute in strict arrival order (see inputQueue). Each link
   * is isolated: a rejected send-keys is swallowed so it can't break the chain
   * for subsequent keystrokes.
   */
  private enqueueInput(
    terminalId: TerminalId,
    data: string,
    enter?: boolean,
  ): void {
    const prev = this.inputQueue.get(terminalId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => this.handleInputFrame(terminalId, data, enter));
    this.inputQueue.set(terminalId, next);
    // Drop the tail reference once it drains so a quiet terminal doesn't pin the
    // last promise forever (only if no newer frame replaced it meanwhile).
    void next.finally(() => {
      if (this.inputQueue.get(terminalId) === next) {
        this.inputQueue.delete(terminalId);
      }
    });
  }

  private async handleInputFrame(
    terminalId: TerminalId,
    data: string,
    enter?: boolean,
  ): Promise<void> {
    const windowId = this.sessionService.resolveWindowId(terminalId);
    if (!windowId) {
      this.logger.warn(`Input for unknown terminalId=${terminalId} — dropped`);
      return;
    }
    const target = `${SESSION_NAME}:${windowId}`;

    // Two input shapes converge here (the input reciprocal pair):
    //   • MCP one-shot: { data: "echo hi", enter: true } — literal text, then a
    //     SEPARATE Enter key event. `enter` is explicitly set.
    //   • Browser per-char: xterm's onData streams RAW INPUT BYTES — printable
    //     chars, `\r` for Return (0x0d), control chars (Ctrl-C = 0x03), and CSI
    //     escape sequences for arrows/Home/End (Up = ESC[A = 1b 5b 41), etc.
    //     These are exactly what a PTY's stdin receives.
    // For the browser path we deliver those bytes VERBATIM via `send-keys -H`
    // (hex), so tmux hands the pane's shell the precise byte stream — `\r` submits,
    // 0x03 raises SIGINT, ESC[A moves the cursor. `send-keys -l` (literal TEXT)
    // could not do this: it only types printable text and mis-handles control and
    // escape bytes (the cause of "can't type / Ctrl-C ignored / cursor broken").
    // The explicit-`enter` MCP path keeps its literal-text + Enter-key behavior.
    try {
      if (enter === undefined) {
        await this.sendBrowserKeys(target, data);
      } else {
        await execFileAsync('tmux', tmux('send-keys', '-t', target, '-l', data));
        if (enter) {
          await execFileAsync('tmux', tmux('send-keys', '-t', target, 'Enter'));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`send-keys failed for ${terminalId}: ${msg}`);
    }
  }

  /**
   * Deliver a raw browser keystroke chunk to the pane as exact bytes via
   * `tmux send-keys -H <hex…>`. xterm's onData stream IS raw terminal input
   * (printable + control bytes + CSI escape sequences); hex-forwarding makes the
   * broker behave like a PTY stdin write — every byte reaches the shell unaltered,
   * so Return submits, Ctrl-C interrupts, and arrow keys move the cursor. One
   * frame → ONE atomic `send-keys` call (the per-terminal input queue keeps frames
   * in arrival order), which also removes the char-splitting reorder hazard.
   */
  private async sendBrowserKeys(target: string, data: string): Promise<void> {
    if (data.length === 0) return;
    // UTF-8 encode, then one two-digit hex token per byte. send-keys -H accepts a
    // space-separated list of hex byte values and injects them in order.
    const hex = Array.from(Buffer.from(data, 'utf8'), (b) =>
      b.toString(16).padStart(2, '0'),
    );
    await execFileAsync('tmux', tmux('send-keys', '-t', target, '-H', ...hex));
  }

  // ── coalescing (flood control, RESPONSIVENESS §3) ─────────────────────────

  private coalesceOutput(terminalId: TerminalId, data: string): void {
    const existing = this.coalesce.get(terminalId);
    if (existing) {
      existing.data += data;
      return;
    }

    const buf: CoalesceBuffer = {
      data,
      timer: setTimeout(() => {
        this.coalesce.delete(terminalId);
        this.flush(terminalId, buf.data);
      }, COALESCE_MS),
    };
    this.coalesce.set(terminalId, buf);
  }

  private flush(terminalId: TerminalId, data: string): void {
    const subs = this.subscribers.get(terminalId);
    if (!subs || subs.size === 0) return;

    const frame: ServerFrame = { type: 'output', terminalId, data, withAnsi: true };
    const payload = JSON.stringify(frame);
    for (const socket of subs) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }
}
