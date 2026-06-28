/**
 * src/lib/term/xterm-client.ts — per-terminalId xterm.js client.
 *
 * Connects a WebSocket to /term/:terminalId (broker TermGateway), attaches
 * an xterm.js Terminal with the DOM renderer + fit/web-links addons, and wires
 * bidirectional I/O:
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
import type {
  ServerFrame,
  InputFrame,
  TerminalId,
} from '@ddx/term-contract';
import { ServerFrameSchema, InputFrameSchema } from '@ddx/term-contract';

import {
  DEFAULT_APPEARANCE,
  resolveFont,
  resolveTheme,
  type TermAppearance,
} from './appearance';

/**
 * Build an xterm ITheme from a selected color template (appearance.ts registry).
 * xterm.js consumes plain hex strings — it cannot parse OKLCH/CSS vars — so the
 * full 16-color ANSI palette lives in the TS theme registry, not globals.css.
 * This replaces the old @theme-hex-mirror lookup: themes are now user-selectable
 * data, not a single hardcoded palette.
 */
function buildXtermTheme(themeId: string): Record<string, string> {
  const { colors } = resolveTheme(themeId);
  return { ...colors };
}

/** WS URL builder — ALWAYS same-origin. The custom Next server (server.mjs)
 *  proxies /term/<id> upgrades to the broker, so the browser never talks to the
 *  broker port directly (single origin → HTTPS-safe, no exposed broker, no
 *  mixed-content). `wss:` under HTTPS, `ws:` under HTTP — matched to the page. */
function buildWsUrl(terminalId: TerminalId): string {
  if (typeof window === 'undefined') return `/term/${terminalId}`;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/term/${terminalId}`;
}

/** Lifecycle state of the WS connection. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Callback shapes the UI layer attaches to observe state changes. */
export interface XtermClientCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onData: (data: string) => void;
  /**
   * Called after the WS auto-reconnects following a drop (e.g. the broker
   * restarted). The page should re-fetch the terminal snapshot and return its
   * text so the just-reconnected socket can repaint the current frame before
   * live output resumes — mirroring the tab-switch resubscribe+snapshot contract.
   * Optional: if absent, reconnect still restores the live stream, just without
   * a snapshot repaint.
   */
  onReconnect?: () => Promise<string>;
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
  private ws: WebSocket | null = null;
  private disposed = false;

  /** Reconnect backoff state — reset to 0 on every successful open. */
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Max reconnect delay (ms). Backoff is 2^n * 250ms, capped here, + jitter. */
  private static readonly RECONNECT_MAX_MS = 8_000;
  private static readonly RECONNECT_BASE_MS = 250;
  private static readonly RECONNECT_MAX_ATTEMPTS = 60; // ~ several minutes of retry

  /**
   * Canonical terminal grid — MUST match the broker's pinned tmux session size
   * (`set-option -g default-size 120x30`, see ddx-term-broker CLAUDE.md). The
   * client renders at exactly this grid so cursor-relative escapes from the shell
   * resolve identically on both sides. If the broker default-size changes, change
   * these together.
   */
  private static readonly COLS = 120;
  private static readonly ROWS = 30;

  /** Current appearance (font + theme). Mutated live via applyAppearance(). */
  private appearance: TermAppearance;

  constructor(
    private readonly terminalId: TerminalId,
    private readonly container: HTMLElement,
    private readonly callbacks: XtermClientCallbacks,
    appearance: TermAppearance = DEFAULT_APPEARANCE,
  ) {
    this.appearance = appearance;
  }

  /** Connect the WebSocket and attach xterm.js to the container element. */
  async connect(): Promise<void> {
    if (this.disposed) return;

    // Lazy-import the xterm modules (client-only, no SSR). We deliberately do NOT
    // load @xterm/addon-webgl: in this embedded-Chrome / GPU context the WebGL
    // renderer silently painted the background but no glyphs (blank pane), and
    // the mid-stream WebGL→DOM fallback caused live-keystroke echo artifacts. The
    // DOM renderer (xterm's default) renders correctly and is plenty fast for an
    // interactive shell — pin it and delete the whole renderer-swap bug class.
    const [
      { Terminal },
      { WebLinksAddon },
    ] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-web-links'),
    ]);

    const term = new Terminal({
      // The BROKER owns canonical dimensions (tmux session pinned at COLS×ROWS).
      // The client MUST render at the SAME grid — never fit-to-container — or the
      // shell's cursor-relative redraws (zsh line editing computes moves like
      // ESC[21D against ITS column count) land at the wrong column in a
      // differently-sized client grid, garbling live typing. Snapshot (absolute
      // positioning) would still look right, but interactive editing breaks. So
      // we fix the grid to the broker's dims and do NOT renegotiate on resize.
      cols: XtermClient.COLS,
      rows: XtermClient.ROWS,
      cursorBlink: true,
      // Font family + size come from the user's persisted appearance (defaults
      // mirror the prior hardcoded values). Changing them re-styles the live
      // terminal via applyAppearance() — never a reconnect (scrollback is kept).
      fontFamily: resolveFont(this.appearance.fontId).stack,
      fontSize: this.appearance.fontSize,
      lineHeight: 1.2,
      // Theme is a user-selected color template from the appearance registry.
      // xterm.js consumes plain hex (no OKLCH/CSS vars), so the palette is TS data.
      theme: buildXtermTheme(this.appearance.themeId),
      allowTransparency: true,
      scrollback: 5000,
    });

    term.loadAddon(new WebLinksAddon());

    // Open into the DOM at the fixed broker grid. DOM renderer only — no WebGL,
    // no FitAddon: the grid is pinned to match the broker, not the container.
    term.open(this.container);

    this.terminal = term;

    // Wire user keystrokes → InputFrame → WS.
    term.onData((data: string) => {
      this.sendInput(data);
      this.callbacks.onData(data);
    });

    this.openWebSocket();
  }

  /**
   * Paint a snapshot text into the terminal before the first live WS frame.
   * Call immediately after connect() returns and the snapshot fetch resolves
   * (RESPONSIVENESS §2.8 — tab switch = resubscribe + snapshot, not reconnect).
   *
   * The broker snapshot comes from `tmux capture-pane -p`, which joins rows with
   * bare LF (`\n`) and no CR. xterm needs CRLF to return the cursor to column 0 —
   * writing bare LF moves DOWN without returning LEFT, producing a right-shifted
   * "staircase". Normalize lone LF → CRLF (without doubling an existing CR) so each
   * snapshot line starts at column 0. Live `%output` frames already carry real CR.
   */
  restoreSnapshot(snapshotText: string): void {
    if (this.terminal && snapshotText) {
      const normalized = snapshotText.replace(/\r?\n/g, '\r\n');
      this.terminal.write(normalized);
    }
  }

  /**
   * Apply a new appearance (font family/size + color theme) to the LIVE terminal
   * without reconnecting — xterm exposes mutable `options`, so we set them in
   * place and the existing scrollback + WS subscription are untouched. The grid
   * stays pinned at COLS×ROWS: a larger font means a bigger pane, never a
   * renegotiated column count (the broker owns dims). Idempotent and safe to call
   * before connect() — it stashes the value for the next Terminal construction.
   */
  applyAppearance(appearance: TermAppearance): void {
    this.appearance = appearance;
    const term = this.terminal;
    if (!term) return; // not yet connected — picked up at construction time
    term.options.fontFamily = resolveFont(appearance.fontId).stack;
    term.options.fontSize = appearance.fontSize;
    term.options.theme = buildXtermTheme(appearance.themeId);
    // Re-assert the pinned grid: changing fontSize can make xterm recompute its
    // internal geometry, so explicitly hold the broker's canonical dimensions.
    term.resize(XtermClient.COLS, XtermClient.ROWS);
  }

  /** Tear down the WS and xterm instance. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 3 = CLOSED numeric constant (WebSocket.CLOSED may be absent on test stubs).
    if (this.ws && this.ws.readyState !== 3) {
      this.ws.close(1000, 'tab-switch');
    }
    this.ws = null;

    this.terminal?.dispose();
    this.terminal = null;
  }

  // ── private ────────────────────────────────────────────────────────────────

  private openWebSocket(): void {
    const url = buildWsUrl(this.terminalId);
    this.callbacks.onStateChange('connecting');

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) return;
      const reconnected = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.callbacks.onStateChange('connected');
      // After a reconnect (broker came back), repaint the current frame via the
      // page's snapshot fetch so the user sees up-to-date state, not a stale or
      // blank pane, before live output resumes.
      if (reconnected && this.callbacks.onReconnect) {
        // Repaint the current frame via the page's snapshot fetch (routed through
        // restoreSnapshot for CRLF normalization) so the reconnect shows live
        // state, not a stale grid, before live output resumes.
        void this.callbacks
          .onReconnect()
          .then((snapshot) => {
            if (!this.disposed && snapshot) this.restoreSnapshot(snapshot);
          })
          .catch(() => { /* snapshot fetch failed — live stream still resumes */ });
      }
    };

    ws.onclose = () => {
      if (this.disposed) return;
      this.callbacks.onStateChange('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      if (this.disposed) return;
      this.callbacks.onStateChange('error');
      // 'error' is followed by 'close'; reconnect is scheduled there. No-op here.
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (this.disposed) return;
      this.handleServerFrame(event.data);
    };
  }

  /**
   * Schedule a WS reconnect with exponential backoff + jitter. Triggered when the
   * socket closes for any reason other than an intentional dispose() (e.g. the
   * broker restarted). Each attempt waits min(2^n · base, max) ms plus up to one
   * base interval of random jitter to avoid a thundering-herd reconnect storm if
   * many terminals drop at once. Stops after RECONNECT_MAX_ATTEMPTS.
   */
  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    if (this.reconnectAttempts >= XtermClient.RECONNECT_MAX_ATTEMPTS) return;

    const exp = Math.min(
      XtermClient.RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      XtermClient.RECONNECT_MAX_MS,
    );
    const jitter = Math.floor(Math.random() * XtermClient.RECONNECT_BASE_MS);
    const delay = exp + jitter;
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      this.openWebSocket();
    }, delay);
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
        // The broker pins the session size and the client grid is fixed to match
        // (COLS×ROWS). We never renegotiate dimensions, so there is nothing to do
        // here — the grids stay aligned by construction.
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
