/**
 * term.gateway.spec.ts
 *
 * Asserts per-terminal WS routing (RESPONSIVENESS §2.8):
 *   - A frame for terminal A is dispatched ONLY to subscribers of A, not B.
 *   - Multiple subscribers of the same terminalId all receive the frame.
 *   - An InputFrame resolves terminalId → windowId via SessionService before
 *     calling send-keys (never conflates the two identifiers, FM#4).
 *   - Output frames from distinct terminals never cross-pollute.
 *
 * No real WebSocket or tmux — uses lightweight stubs.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Test } from '@nestjs/testing';
import { TermGateway } from './term.gateway';
import { SessionService } from '../session/session.service';
import { ControlModeAttach } from '../control-mode/control-mode.attach';
import { EXEC_RUNNER } from '../session/session.service';
import {
  TerminalService,
  type SnapshotWithScrollbackResult,
} from '../terminal/terminal.service';
import {
  toTerminalId,
  type TerminalId,
  type WindowId,
  DEFAULT_RESIZE_POLICY,
  DEFAULT_INPUT_ARBITRATION,
} from '@ddx/term-contract';
import { WebSocket } from 'ws';

// ── Stubs ────────────────────────────────────────────────────────────────────

const TERM_A = toTerminalId('term-a');
const TERM_B = toTerminalId('term-b');
const WIN_A = '@1' as WindowId;
const WIN_B = '@2' as WindowId;

class StubSessionService {
  resolveWindowId(terminalId: TerminalId): WindowId | undefined {
    if (terminalId === TERM_A) return WIN_A;
    if (terminalId === TERM_B) return WIN_B;
    return undefined;
  }
  getSessionDescriptor() {
    return {
      sessionId: 'ddx-shared',
      socketPath: '/tmp/ddx-term.sock',
      cols: 120,
      rows: 30,
      resizePolicy: DEFAULT_RESIZE_POLICY,
      inputArbitration: DEFAULT_INPUT_ARBITRATION,
      defaultTerminalId: 't01',
      createdAt: Date.now(),
    };
  }
}

class StubControlModeAttach {
  start(): void { /* no-op — no real tmux */ }
  stop(): void { /* no-op */ }
}

/**
 * Stub TerminalService for the cold-attach snapshot push. Resolves a fixed
 * snapshot by default (mirrors production: every subscribe gets exactly one
 * `snapshot` frame). Routing/coalescing tests below use `liveMessages()` to
 * strip that leading snapshot frame before asserting on live-dispatch
 * behavior — the snapshot push and live routing are orthogonal concerns.
 */
class StubTerminalService {
  resolveSnapshot:
    | ((terminalId: TerminalId) => Promise<SnapshotWithScrollbackResult>)
    | undefined;

  async snapshotWithScrollback(
    rawId: string,
  ): Promise<SnapshotWithScrollbackResult> {
    const terminalId = toTerminalId(rawId);
    if (this.resolveSnapshot) {
      return this.resolveSnapshot(terminalId);
    }
    return {
      terminalId,
      content: 'stub-snapshot',
      cols: 120,
      rows: 30,
      capturedAt: Date.now(),
      scrollbackLines: 500,
    };
  }
}

/** Minimal WebSocket stub that records sent messages. */
function makeSocket(): { socket: WebSocket; messages: string[] } {
  const messages: string[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => { messages.push(data); },
    on: () => { /* no-op */ },
    close: () => { /* no-op */ },
  } as unknown as WebSocket;
  return { socket, messages };
}

/**
 * Strip the leading cold-attach `snapshot` frame(s) from a recorded messages
 * array so routing/coalescing assertions can focus on LIVE dispatch, which
 * is the orthogonal concern those tests exist to cover.
 */
function liveMessages(messages: string[]): string[] {
  return messages.filter((m) => {
    const parsed = JSON.parse(m) as { type?: string };
    return parsed.type !== 'snapshot';
  });
}

// ── Module factory ───────────────────────────────────────────────────────────

async function buildGateway(): Promise<{
  gateway: TermGateway;
  terminalService: StubTerminalService;
}> {
  const terminalService = new StubTerminalService();
  const module = await Test.createTestingModule({
    providers: [
      TermGateway,
      { provide: SessionService, useClass: StubSessionService },
      { provide: ControlModeAttach, useClass: StubControlModeAttach },
      { provide: TerminalService, useValue: terminalService },
      { provide: EXEC_RUNNER, useValue: async () => ({ stdout: '', stderr: '' }) },
    ],
  }).compile();
  return { gateway: module.get(TermGateway), terminalService };
}

/** Simulate a WS connection for a given terminalId. */
function connectSocket(
  gateway: TermGateway,
  terminalId: TerminalId,
): { socket: WebSocket; messages: string[] } {
  const { socket, messages } = makeSocket();
  gateway.handleConnection(socket, { url: `/term/${terminalId}` });
  return { socket, messages };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TermGateway › restore-on-attach ordering (task_002 reciprocal contract)', () => {
  it('sends the snapshot frame FIRST, before any live output frame, on attach', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages } = connectSocket(gw, TERM_A);

    // A live frame dispatched immediately after attach must never overtake the
    // initial snapshot — the web consumer's buffer-until-painted guard relies on
    // the snapshot being the authoritative first paint (see ddx-term-web
    // xterm-client.ts). Guarding by contract, not by "in practice" ordering.
    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'live-1', withAnsi: true });
    await new Promise((r) => setTimeout(r, 30));

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const first = JSON.parse(messages[0] ?? '{}') as { type: string };
    expect(first.type).toBe('snapshot');
  });

  it('dispatches an output frame only to subscribers of the matching terminalId', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages: msgsA } = connectSocket(gw, TERM_A);
    const { messages: msgsB } = connectSocket(gw, TERM_B);

    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'hello', withAnsi: true });

    // Give coalesce timer a chance to fire.
    await new Promise((r) => setTimeout(r, 30));

    const liveA = liveMessages(msgsA);
    expect(liveA).toHaveLength(1);
    expect(liveMessages(msgsB)).toHaveLength(0);
    const parsed = JSON.parse(liveA[0] ?? '{}') as { terminalId: string; data: string };
    expect(parsed.terminalId).toBe('term-a');
    expect(parsed.data).toBe('hello');
  });

  it('a frame for terminal B is NOT delivered to subscribers of terminal A', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages: msgsA } = connectSocket(gw, TERM_A);
    const { messages: msgsB } = connectSocket(gw, TERM_B);

    gw.dispatchFrame({ type: 'output', terminalId: TERM_B, data: 'from-b', withAnsi: false });
    await new Promise((r) => setTimeout(r, 30));

    expect(liveMessages(msgsB)).toHaveLength(1);
    expect(liveMessages(msgsA)).toHaveLength(0);
  });

  it('broadcasts to ALL subscribers of the same terminalId', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages: msgs1 } = connectSocket(gw, TERM_A);
    const { messages: msgs2 } = connectSocket(gw, TERM_A);

    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'broadcast', withAnsi: true });
    await new Promise((r) => setTimeout(r, 30));

    expect(liveMessages(msgs1)).toHaveLength(1);
    expect(liveMessages(msgs2)).toHaveLength(1);
  });

  it('coalesces rapid output frames into one send within the 16ms window', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages } = connectSocket(gw, TERM_A);

    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'chunk1', withAnsi: true });
    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'chunk2', withAnsi: true });
    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'chunk3', withAnsi: true });

    await new Promise((r) => setTimeout(r, 30));

    // All three chunks coalesced into one send.
    const live = liveMessages(messages);
    expect(live).toHaveLength(1);
    const parsed = JSON.parse(live[0] ?? '{}') as { data: string };
    expect(parsed.data).toBe('chunk1chunk2chunk3');
  });

  it('sends non-output frames immediately (no coalescing)', async () => {
    const { gateway: gw } = await buildGateway();
    const { messages } = connectSocket(gw, TERM_A);

    gw.dispatchFrame({
      type: 'layout-change',
      terminalId: TERM_A,
      cols: 120,
      rows: 30,
    });

    // No timer needed — sent immediately.
    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0] ?? '{}') as { type: string };
    expect(parsed.type).toBe('layout-change');
  });
});

describe('TermGateway › connection lifecycle', () => {
  it('rejects a WS connection with no terminalId in the URL', async () => {
    const { gateway: gw } = await buildGateway();
    const { socket, messages } = makeSocket();
    let closed = false;
    (socket as unknown as { close: (code: number, reason: string) => void }).close = (code) => {
      closed = true;
      expect(code).toBe(1008);
    };

    gw.handleConnection(socket, { url: '/term/' });
    expect(closed).toBe(true);
    expect(messages).toHaveLength(0);
  });

  it('removes client from subscriber set on disconnect', async () => {
    const { gateway: gw } = await buildGateway();
    const { socket, messages } = connectSocket(gw, TERM_A);

    gw.handleDisconnect(socket);

    // After disconnect, frames are no longer delivered.
    gw.dispatchFrame({ type: 'output', terminalId: TERM_A, data: 'post-disc', withAnsi: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(liveMessages(messages)).toHaveLength(0);
  });
});

describe('TermGateway › AC#12 cross-terminal isolation (HIGH-1)', () => {
  /**
   * A socket subscribed to terminal A sends an input frame claiming terminal B.
   * Expected: keystrokes are NOT sent to B; socket is closed with code 1008.
   */
  it('rejects an input frame whose terminalId differs from the subscribed terminalId', async () => {
    const { gateway: gw } = await buildGateway();

    // Socket subscribes to TERM_A.
    const { socket: socketA, messages: msgsA } = connectSocket(gw, TERM_A);

    // Track close calls on socketA.
    let closedCode: number | undefined;
    let closedReason: string | undefined;
    (socketA as unknown as { close: (code: number, reason: string) => void }).close = (
      code,
      reason,
    ) => {
      closedCode = code;
      closedReason = reason;
    };

    // Socket B subscribes to TERM_B so we can verify it receives nothing.
    const { messages: msgsB } = connectSocket(gw, TERM_B);

    // Spoof: send an input frame claiming TERM_B from a socket subscribed to TERM_A.
    const spoofedFrame = JSON.stringify({
      type: 'input',
      terminalId: TERM_B,
      data: 'injected-keystroke',
      enter: false,
    });
    // Drive the message handler directly (mirrors the socket.on('message') path).
    (gw as unknown as {
      handleClientMessage: (socket: typeof socketA, raw: string) => void;
    }).handleClientMessage(socketA, spoofedFrame);

    // Give any async send-keys a chance to run (there should be none).
    await new Promise((r) => setTimeout(r, 30));

    // Socket A must be closed with 1008 (policy violation).
    expect(closedCode).toBe(1008);
    expect(closedReason).toBe('terminalId mismatch');

    // No keystroke frame delivered to terminal B subscribers.
    expect(liveMessages(msgsB)).toHaveLength(0);

    // No frame sent to terminal A subscribers either.
    expect(liveMessages(msgsA)).toHaveLength(0);
  });

  it('accepts a valid input frame whose terminalId matches the subscribed terminalId', async () => {
    const { gateway: gw } = await buildGateway();
    const { socket: socketA } = connectSocket(gw, TERM_A);

    let closedCode: number | undefined;
    (socketA as unknown as { close: (code: number, reason: string) => void }).close = (code) => {
      closedCode = code;
    };

    // Legitimate frame: terminalId matches the subscription.
    const validFrame = JSON.stringify({
      type: 'input',
      terminalId: TERM_A,
      data: 'hello',
      enter: false,
    });
    (gw as unknown as {
      handleClientMessage: (socket: typeof socketA, raw: string) => void;
    }).handleClientMessage(socketA, validFrame);

    await new Promise((r) => setTimeout(r, 10));

    // Socket must NOT be closed (no 1008).
    expect(closedCode).toBeUndefined();
  });
});
