/**
 * src/lib/term/xterm-client.ts — per-terminalId xterm.js client.
 *
 * Connects a WebSocket to /term/:terminalId (broker TermGateway), attaches
 * an xterm.js Terminal with webgl + fit addons, and wires bidirectional I/O:
 *
 *   Server → client: ServerFrame JSON → writes output bytes / applies layout.
 *   Client → server: onData(key) → InputFrame JSON → tmux send-keys -l.
 *
 * Frame types are imported ONLY from @ddx/term-contract — never redefined here
 * (invariant §MUST keep ALL shared zod types in @ddx/term-contract ONLY).
 *
 * Tab switch = dispose() + new XtermClient() for the next terminalId, then
 * call restoreSnapshot(snapshotText) to paint the current frame BEFORE the
 * first live frame arrives (RESPONSIVENESS §2.8 — not a full reconnect).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  ServerFrame,
  InputFrame,
  TerminalId,
} from '@ddx/term-contract';
import { ServerFrameSchema, InputFrameSchema } from '@ddx/term-contract';

/**
 * Read a CSS custom property from :root at runtime.
 * xterm.js cannot consume OKLCH or CSS var() references directly, so we
 * resolve the hex mirrors declared in globals.css @theme at mount time.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** Build xterm ITheme from the @theme hex-mirror CSS vars. */
function buildXtermTheme(): Record<string, string> {
  return {
    background:         cssVar('--xterm-bg-hex',        '#18192b'),
    foreground:         cssVar('--xterm-fg-hex',        '#e8e9f0'),
    cursor:             cssVar('--xterm-cursor-hex',    '#7c8aff'),
    selectionBackground: cssVar('--xterm-selection-hex', '#3a3d60'),
  };
}

/** WS URL builder — reads the env var set at build time or falls back to same-origin path. */
function buildWsUrl(terminalId: TerminalId): string {
  // NEXT_PUBLIC_BROKER_WS_URL must be ws://host:port in dev (env-injected).
  // In production the WS should be proxied through the same origin.
  const base =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_BROKER_WS_URL'] ?? `ws://${window.location.host}`)
      : '';
  return `${base}/term/${terminalId}`;
}

/** Lifecycle state of the WS connection. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Callback shapes the UI layer attaches to observe state changes. */
export interface XtermClientCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onData: (data: string) => void;
}

/**
 * XtermClient — manages ONE xterm.js Terminal instance bound to ONE terminalId.
 *
 * Lifecycle:
 *   const client = new XtermClient(terminalId, element, callbacks);
 *   await client.connect();           // opens WS, attaches xterm
 *   client.restoreSnapshot(text);     // paint snapshot before first live frame
 *   // … user types, frames arrive …
 *   client.dispose();                 // close WS, destroy xterm, remove from DOM
 */
export class XtermClient {
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private ws: WebSocket | null = null;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly terminalId: TerminalId,
    private readonly container: HTMLElement,
    private readonly callbacks: XtermClientCallbacks,
  ) {}

  /** Connect the WebSocket and attach xterm.js to the container element. */
  async connect(): Promise<void> {
    if (this.disposed) return;

    // Lazy-import the heavy xterm modules (client-only, no SSR).
    const [
      { Terminal },
      { FitAddon },
      { WebglAddon },
      { WebLinksAddon },
    ] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-webgl'),
      import('@xterm/addon-web-links'),
    ]);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      // Theme hex values are resolved from globals.css @theme hex-mirror vars
      // at runtime via buildXtermTheme(). xterm.js cannot consume CSS vars or
      // OKLCH directly — the @theme block in globals.css is the single source.
      theme: buildXtermTheme(),
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    try {
      const webgl = new WebglAddon();
      // WebGL may fail on some systems — fall back gracefully.
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // Canvas renderer used as fallback — no action needed.
    }

    term.open(this.container);
    fitAddon.fit();

    this.terminal = term;
    this.fitAddon = fitAddon;

    // Wire user keystrokes → InputFrame → WS.
    term.onData((data: string) => {
      this.sendInput(data);
      this.callbacks.onData(data);
    });

    // Keep xterm sized to the container.
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.disposed) {
        fitAddon.fit();
      }
    });
    this.resizeObserver.observe(this.container);

    this.openWebSocket();
  }

  /**
   * Paint a snapshot text into the terminal before the first live WS frame.
   * Call immediately after connect() returns and the snapshot fetch resolves
   * (RESPONSIVENESS §2.8 — tab switch = resubscribe + snapshot, not reconnect).
   */
  restoreSnapshot(snapshotText: string): void {
    if (this.terminal && snapshotText) {
      this.terminal.write(snapshotText);
    }
  }

  /** Fit xterm to the current container size (call after layout changes). */
  fit(): void {
    this.fitAddon?.fit();
  }

  /** Tear down the WS, xterm instance, and resize observer. */
  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    // 3 = CLOSED numeric constant (WebSocket.CLOSED may be absent on test stubs).
    if (this.ws && this.ws.readyState !== 3) {
      this.ws.close(1000, 'tab-switch');
    }
    this.ws = null;

    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }

  // ── private ────────────────────────────────────────────────────────────────

  private openWebSocket(): void {
    const url = buildWsUrl(this.terminalId);
    this.callbacks.onStateChange('connecting');

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (!this.disposed) {
        this.callbacks.onStateChange('connected');
      }
    };

    ws.onclose = () => {
      if (!this.disposed) {
        this.callbacks.onStateChange('disconnected');
      }
    };

    ws.onerror = () => {
      if (!this.disposed) {
        this.callbacks.onStateChange('error');
      }
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (this.disposed) return;
      this.handleServerFrame(event.data);
    };
  }

  private handleServerFrame(raw: string): void {
    let frame: ServerFrame;
    try {
      frame = ServerFrameSchema.parse(JSON.parse(raw));
    } catch {
      // Malformed frame — skip silently; broker logs the source.
      return;
    }

    if (!this.terminal) return;

    switch (frame.type) {
      case 'output':
        // Write bytes directly — xterm handles ANSI escapes.
        this.terminal.write(frame.data);
        break;

      case 'layout-change':
        // The broker pinned the session size; we fit xterm to the container
        // independently. Trigger a fit to stay aligned.
        this.fitAddon?.fit();
        break;

      case 'window-add':
      case 'window-close':
      case 'process-snapshot':
      case 'error':
        // These frames are handled at the page level by the tab bar / status
        // display — the xterm instance itself needs no action.
        break;

      default: {
        // Exhaustive check — TypeScript ensures this is unreachable if a new
        // frame type is added to the contract without updating this switch.
        const _exhaustive: never = frame;
        void _exhaustive;
      }
    }
  }

  private sendInput(data: string): void {
    // Use numeric literal 1 (OPEN) — WebSocket.OPEN may be undefined when the
    // global WebSocket is replaced by a test stub that lacks static properties.
    if (!this.ws || this.ws.readyState !== 1) return;

    const frame: InputFrame = InputFrameSchema.parse({
      type: 'input',
      terminalId: this.terminalId,
      data,
    });

    this.ws.send(JSON.stringify(frame));
  }
}
