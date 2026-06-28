/**
 * server.mjs — custom Next.js 16 server with a WebSocket upgrade proxy.
 *
 * WHY a custom server: Next's default `next dev` / `next start` does NOT handle
 * WebSocket `upgrade` requests, and next.config `rewrites` proxy only HTTP — never
 * the upgrade handshake. To keep the browser on a SINGLE ORIGIN (works under HTTPS,
 * no exposed broker port, no mixed-content), the WS must be proxied through Next.
 *
 * This server:
 *   1. Runs the Next request handler for all HTTP (pages, /api rewrites, assets).
 *   2. Intercepts `upgrade` events for `/term/<terminalId>` and bridges them to the
 *      broker's WS (ws://BROKER/term/<terminalId>), piping frames both ways.
 *
 * The browser connects same-origin: ws://<this-host>/term/<id>. The broker
 * (DDX_TERM_BROKER_WS, default ws://127.0.0.1:6481) stays private to the server.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { createServer } from 'node:http';
import next from 'next';
import { WebSocket, WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3460);
const hostname = process.env.HOSTNAME ?? 'localhost';

// Broker WS origin — server-side only, NEVER shipped to the browser.
const brokerWsBase = (process.env.DDX_TERM_BROKER_WS ?? 'ws://127.0.0.1:6481').replace(/\/$/, '');

// Only proxy the terminal WS path; everything else is a normal Next upgrade
// (e.g. Next's own HMR websocket in dev) and must be left to Next.
const TERM_PATH = /^\/term\/[^/?]+/;

const app = next({ dev, hostname, port });

// prepare() MUST run before getRequestHandler/getUpgradeHandler (Next throws
// "prepare() must be called before performing this operation" otherwise).
await app.prepare();

const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[next] request error:', err);
    res.statusCode = 500;
    res.end('internal error');
  });
});

// noServer WS — we perform the handshake ourselves only for /term/*.
const wss = new WebSocketServer({ noServer: true });

/**
 * Sanitize a WebSocket close code for passing to `.close(code)`.
 *
 * The WS spec RESERVES 1004, 1005, 1006, and 1015 — they may appear in a RECEIVED
 * close event (1006 = abnormal closure when the broker is killed) but passing any
 * of them to `.close()` throws RangeError. That uncaught throw is exactly what
 * crashed the whole web process when the broker restarted. Only 1000 and the
 * application range 3000-4999 are safe to forward; everything else maps to 1011
 * (internal error / going away).
 */
function safeCloseCode(code) {
  if (code === 1000) return 1000;
  if (typeof code === 'number' && code >= 3000 && code <= 4999) return code;
  return 1011;
}

/** Close a socket without ever throwing (reserved code, double-close, dead peer). */
function safeClose(ws, code, reason) {
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(safeCloseCode(code), reason);
    }
  } catch {
    // Last resort — terminate hard rather than crash the process.
    try { ws.terminate?.(); } catch { /* give up silently */ }
  }
}

server.on('upgrade', (req, socket, head) => {
  // The RAW upgrade socket can emit 'error' (ECONNRESET) before/while we wire the
  // WS client. An 'error' event with no listener is an unhandled exception that
  // crashes Node — attach a guard immediately, the instant we get the socket.
  socket.on('error', () => { try { socket.destroy(); } catch { /* noop */ } });

  const url = req.url ?? '';
  if (!TERM_PATH.test(url)) {
    // Not a terminal socket → let Next handle it (HMR, etc.).
    upgradeHandler(req, socket, head).catch(() => { try { socket.destroy(); } catch { /* noop */ } });
    return;
  }

  // Complete the handshake with the browser, then open a socket to the broker
  // and pipe both directions. Frames are opaque — we don't parse them here.
  wss.handleUpgrade(req, socket, head, (client) => {
    const target = `${brokerWsBase}${url}`;
    let upstream;
    try {
      upstream = new WebSocket(target);
    } catch {
      // Bad URL / immediate failure — close the browser side cleanly, don't throw.
      safeClose(client, 1011, 'broker unreachable');
      return;
    }
    let upstreamOpen = false;
    const pending = [];

    // EVERY socket gets an 'error' listener so a peer drop never becomes an
    // unhandled exception. The handlers below are all try-wrapped via safeClose.
    upstream.on('open', () => {
      upstreamOpen = true;
      try { for (const m of pending) upstream.send(m); } catch { /* peer gone */ }
      pending.length = 0;
    });
    upstream.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(data.toString()); } catch { /* client gone */ }
      }
    });
    upstream.on('close', (code) => safeClose(client, code, 'broker closed'));
    upstream.on('error', () => safeClose(client, 1011, 'broker unreachable'));

    client.on('message', (data) => {
      const m = data.toString();
      if (upstreamOpen) {
        try { upstream.send(m); } catch { /* upstream gone */ }
      } else {
        pending.push(m);
      }
    });
    client.on('close', () => safeClose(upstream, 1000, 'client closed'));
    client.on('error', () => safeClose(upstream, 1011, 'client error'));
  });
});

// Process-level backstop. The per-socket error handling above is the real fix,
// but a stray unhandled error in any dependency must NOT take down the whole web
// tier (which would also drop every other connected terminal). Log and survive.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[server] uncaughtException (surviving):', err?.message ?? err);
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandledRejection (surviving):', reason);
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`▲ ddx-term-web ready on http://${hostname}:${port}  (WS /term/* → ${brokerWsBase})`);
});
