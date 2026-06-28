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
  WebSocketGateway,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
// corsOrigins mirrors main.ts: sourced from CORS_ORIGINS env to cover raw ws://
// upgrades — NestFactory global CORS does NOT apply to WebSocket upgrades (MED-2).
const corsOrigins = (process.env['CORS_ORIGINS'] ?? '').split(',').filter(Boolean);
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Server as WsServer, WebSocket } from 'ws';
import {
  type ServerFrame,
  type ClientFrame,
  type TerminalId,
  type WindowId,
  ClientFrameSchema,
} from '@ddx/term-contract';
import { SessionService } from '../session/session.service';
import { ControlModeAttach } from '../control-mode/control-mode.attach';

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

/** Pending coalesced output for one terminalId. */
interface CoalesceBuffer {
  data: string;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
@WebSocketGateway({ path: '/term', cors: { origin: corsOrigins } })
export class TermGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationBootstrap,
    OnModuleDestroy
{
  private readonly logger = new Logger(TermGateway.name);

  @WebSocketServer()
  private server!: WsServer;

  /** Map from terminalId → set of subscribed WebSocket clients. */
  private readonly subscribers = new Map<TerminalId, Set<WebSocket>>();

  /** Per-terminalId coalesce buffers (flood control). */
  private readonly coalesce = new Map<TerminalId, CoalesceBuffer>();

  /** All live connections — keyed by socket for quick subscription lookup. */
  private readonly connections = new Map<WebSocket, Subscription>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly controlModeAttach: ControlModeAttach,
  ) {}

  // ── lifecycle ─────────────────────────────────────────────────────────────

  afterInit(_server: WsServer): void {
    this.logger.log(`TermGateway initialised on path /term`);
  }

  onApplicationBootstrap(): void {
    // Start the control-mode attach loop. The resolver maps tmux windowId →
    // terminalId (reverse lookup) so inbound %output frames are routed to the
    // correct WebSocket subscriber set. SessionService owns the canonical
    // registry; newly-created windows are immediately routable via this closure.
    this.controlModeAttach.start(
      (windowId: WindowId) => this.sessionService.resolveTerminalId(windowId),
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

  handleConnection(socket: WebSocket, req: { url?: string }): void {
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
      void this.handleInputFrame(socket, parsed.terminalId, parsed.data, parsed.enter);
    }
  }

  private async handleInputFrame(
    _socket: WebSocket,
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

    // MUST use send-keys -l for literal text injection (SPIKE.md discipline).
    // A separate Enter key event is sent if requested.
    try {
      await execFileAsync('tmux', tmux('send-keys', '-t', target, '-l', data));
      if (enter) {
        await execFileAsync('tmux', tmux('send-keys', '-t', target, 'Enter'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`send-keys failed for ${terminalId}: ${msg}`);
    }
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
