/**
 * xterm-client.spec.ts — unit tests for XtermClient.
 *
 * Tests verify the three acceptance criteria for C1:
 *   AC #7 — server output frame → written to xterm terminal.
 *   AC #1 — keystroke → InputFrame emitted over WS.
 *   AC #12/#15 — tab switch (dispose + new XtermClient + restoreSnapshot)
 *                triggers a WS resubscribe and paints the snapshot (not a
 *                full reconnect).
 *
 * Uses jsdom + vitest. xterm.js DOM addons are mocked (WebGL not available in
 * jsdom). WS is replaced with a minimal stub.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toTerminalId } from '@ddx/term-contract';
import type { ConnectionState, XtermClientCallbacks } from './xterm-client';

// ── WebSocket stub ──────────────────────────────────────────────────────────

interface WsStub {
  url: string;
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  simulateOpen: () => void;
  simulateMessage: (data: string) => void;
  simulateClose: () => void;
}

function makeWsStub(url: string): WsStub {
  const stub: WsStub = {
    url,
    readyState: 0 /* CONNECTING */,
    sentMessages: [],
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send(data: string) { this.sentMessages.push(data); },
    close() { this.readyState = 3 /* CLOSED */; this.onclose?.(); },
    simulateOpen() { this.readyState = 1 /* OPEN */; this.onopen?.(); },
    simulateMessage(data: string) { this.onmessage?.({ data }); },
    simulateClose() { this.readyState = 3; this.onclose?.(); },
  };
  return stub;
}

// Track all WsStub instances created during a test.
let wsInstances: WsStub[] = [];

// ── xterm.js stubs ──────────────────────────────────────────────────────────

interface TerminalStub {
  writtenData: string[];
  dataHandler: ((data: string) => void) | null;
  disposed: boolean;
  write: (data: string) => void;
  onData: (handler: (data: string) => void) => void;
  open: (el: HTMLElement) => void;
  dispose: () => void;
  loadAddon: () => void;
}

function makeTerminalStub(): TerminalStub {
  return {
    writtenData: [],
    dataHandler: null,
    disposed: false,
    write(data: string) { this.writtenData.push(data); },
    onData(handler: (data: string) => void) { this.dataHandler = handler; },
    open(_el: HTMLElement) { /* no-op in jsdom */ },
    dispose() { this.disposed = true; },
    loadAddon() { /* no-op */ },
  };
}

let terminalStub: TerminalStub;

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => terminalStub),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({ fit: vi.fn(), dispose: vi.fn() })),
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn(() => ({ onContextLoss: vi.fn(), dispose: vi.fn() })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(() => ({})),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks(): { callbacks: XtermClientCallbacks; states: ConnectionState[]; dataEvents: string[] } {
  const states: ConnectionState[] = [];
  const dataEvents: string[] = [];
  const callbacks: XtermClientCallbacks = {
    onStateChange: (s) => states.push(s),
    onData: (d) => dataEvents.push(d),
  };
  return { callbacks, states, dataEvents };
}

function makeContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('XtermClient', () => {
  beforeEach(() => {
    wsInstances = [];
    terminalStub = makeTerminalStub();

    // Patch global WebSocket with our stub factory.
    vi.stubGlobal('WebSocket', vi.fn((url: string) => {
      const stub = makeWsStub(url);
      wsInstances.push(stub);
      return stub;
    }));

    // Patch ResizeObserver (not in jsdom).
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })));

    // Patch getComputedStyle for the CSS var reads in buildXtermTheme.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (_name: string) => '',
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // ── AC #7 — output frame → written to xterm ─────────────────────────────

  it('AC#7: writes output frame data to the xterm terminal (once painted)', async () => {
    const { XtermClient } = await import('./xterm-client');
    const terminalId = toTerminalId('t01');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    const client = new XtermClient(terminalId, el, callbacks);
    await client.connect();

    const ws = wsInstances[0];
    expect(ws).toBeDefined();
    ws!.simulateOpen();

    // task_004: a live frame before the snapshot paints is buffered, not
    // written — restoreSnapshot() (or a broker `snapshot` frame) is what
    // flips painted=true. See the dedicated buffer-until-painted tests below
    // for the ordering guarantee itself; this test only re-asserts AC#7 once
    // painted, matching the real page's connect() → restoreSnapshot() flow.
    client.restoreSnapshot('');

    // Broker emits an output frame.
    const frame = JSON.stringify({ type: 'output', terminalId: 't01', data: 'hello\r\n' });
    ws!.simulateMessage(frame);

    expect(terminalStub.writtenData).toContain('hello\r\n');

    client.dispose();
  });

  // ── AC #1 — keystroke → InputFrame sent over WS ──────────────────────────

  it('AC#1: keystroke triggers an input frame sent over the WebSocket', async () => {
    const { XtermClient } = await import('./xterm-client');
    const terminalId = toTerminalId('t01');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    const client = new XtermClient(terminalId, el, callbacks);
    await client.connect();

    const ws = wsInstances[0];
    // simulateOpen sets readyState = 1 (OPEN) so sendInput will proceed.
    ws!.simulateOpen();

    // Simulate the user typing — xterm calls the onData handler.
    terminalStub.dataHandler?.('ls\r');

    expect(ws!.sentMessages).toHaveLength(1);
    const sent = JSON.parse(ws!.sentMessages[0]!) as Record<string, unknown>;
    expect(sent['type']).toBe('input');
    expect(sent['terminalId']).toBe('t01');
    expect(sent['data']).toBe('ls\r');

    client.dispose();
  });

  // ── AC #12/#15 — tab switch = dispose + new client + restoreSnapshot ──────

  it('AC#12/AC#15: tab switch disposes the old client, opens a new WS, and paints the snapshot', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    // First terminal.
    const clientA = new XtermClient(toTerminalId('t01'), el, callbacks);
    await clientA.connect();
    const wsA = wsInstances[0];
    wsA!.simulateOpen();
    expect(wsInstances).toHaveLength(1);

    // Simulate tab switch: dispose A, create B.
    clientA.dispose();

    // After dispose the WS for A should be closed.
    expect(wsA!.readyState).toBe(3 /* CLOSED */);

    // Reset xterm stub for the second client.
    terminalStub = makeTerminalStub();

    const clientB = new XtermClient(toTerminalId('t02'), el, { ...callbacks });
    await clientB.connect();

    // A second WS must have been opened (resubscribe, not reconnect).
    expect(wsInstances).toHaveLength(2);
    const wsB = wsInstances[1];
    expect(wsB!.url).toContain('/term/t02');

    // restoreSnapshot paints the snapshot text without a full reconnect.
    clientB.restoreSnapshot('$ top\r\n');
    expect(terminalStub.writtenData).toContain('$ top\r\n');

    clientB.dispose();
  });

  // ── State transitions ────────────────────────────────────────────────────

  it('emits connecting → connected state transitions on WS open', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks, states } = makeCallbacks();

    const client = new XtermClient(toTerminalId('t01'), el, callbacks);
    await client.connect();

    expect(states).toContain('connecting');

    wsInstances[0]!.simulateOpen();
    expect(states).toContain('connected');

    client.dispose();
  });

  it('emits disconnected when the WS closes', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks, states } = makeCallbacks();

    const client = new XtermClient(toTerminalId('t01'), el, callbacks);
    await client.connect();
    wsInstances[0]!.simulateOpen();
    wsInstances[0]!.simulateClose();

    expect(states).toContain('disconnected');

    client.dispose();
  });

  // ── task_004: buffer-until-painted guard ────────────────────────────────

  it('AC3.1/AC3.2: buffers live frames until the snapshot paints, then flushes in order', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    const client = new XtermClient(toTerminalId('t01'), el, callbacks);
    await client.connect();
    const ws = wsInstances[0]!;
    ws.simulateOpen();

    // Live frames race ahead of the snapshot — must NOT write yet.
    ws.simulateMessage(JSON.stringify({ type: 'output', terminalId: 't01', data: 'first\r\n' }));
    ws.simulateMessage(JSON.stringify({ type: 'output', terminalId: 't01', data: 'second\r\n' }));
    expect(terminalStub.writtenData).toHaveLength(0);

    // REST-fallback snapshot arrives and paints — this is the flush trigger.
    client.restoreSnapshot('$ prompt\r\n');

    // Snapshot painted FIRST, then the two buffered frames in arrival order.
    expect(terminalStub.writtenData).toEqual(['$ prompt\r\n', 'first\r\n', 'second\r\n']);

    // Frames after the flush write immediately (no longer buffered).
    ws.simulateMessage(JSON.stringify({ type: 'output', terminalId: 't01', data: 'live\r\n' }));
    expect(terminalStub.writtenData).toEqual(['$ prompt\r\n', 'first\r\n', 'second\r\n', 'live\r\n']);

    client.dispose();
  });

  it('AC4.2: a broker snapshot frame paints as the authoritative first frame, before buffered live frames', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    const client = new XtermClient(toTerminalId('t01'), el, callbacks);
    await client.connect();
    const ws = wsInstances[0]!;
    ws.simulateOpen();

    // A live frame arrives before the broker's snapshot frame (cold-attach race).
    ws.simulateMessage(JSON.stringify({ type: 'output', terminalId: 't01', data: 'racer\r\n' }));
    expect(terminalStub.writtenData).toHaveLength(0);

    // Broker's own snapshot frame (task_002/task_001) — the authoritative
    // cold-attach repaint. Bare-LF (no CR) mirrors tmux capture-pane -p output;
    // restoreSnapshot's CRLF-normalize applies here too since the same method
    // paints it.
    ws.simulateMessage(JSON.stringify({
      type: 'snapshot', terminalId: 't01', data: '$ snapshot\n', cols: 120, rows: 30,
    }));

    expect(terminalStub.writtenData).toEqual(['$ snapshot\r\n', 'racer\r\n']);

    client.dispose();
  });

  it('a flush attempted after dispose() performs no write', async () => {
    const { XtermClient } = await import('./xterm-client');
    const el = makeContainer();
    const { callbacks } = makeCallbacks();

    const client = new XtermClient(toTerminalId('t01'), el, callbacks);
    await client.connect();
    const ws = wsInstances[0]!;
    ws.simulateOpen();

    // Buffer a live frame, then dispose BEFORE anything paints.
    ws.simulateMessage(JSON.stringify({ type: 'output', terminalId: 't01', data: 'buffered\r\n' }));
    expect(terminalStub.writtenData).toHaveLength(0);

    client.dispose();

    // A stale restoreSnapshot() call (e.g. a slow REST fetch resolving after
    // dispose) must not paint or flush the now-orphaned buffer.
    client.restoreSnapshot('$ stale\r\n');
    expect(terminalStub.writtenData).toHaveLength(0);
  });
});
