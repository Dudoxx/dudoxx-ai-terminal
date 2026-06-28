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

server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? '';
  if (!TERM_PATH.test(url)) {
    // Not a terminal socket → let Next handle it (HMR, etc.).
    upgradeHandler(req, socket, head).catch(() => socket.destroy());
    return;
  }

  // Complete the handshake with the browser, then open a socket to the broker
  // and pipe both directions. Frames are opaque — we don't parse them here.
  wss.handleUpgrade(req, socket, head, (client) => {
    const target = `${brokerWsBase}${url}`;
    const upstream = new WebSocket(target);
    let upstreamOpen = false;
    const pending = [];

    upstream.on('open', () => {
      upstreamOpen = true;
      for (const m of pending) upstream.send(m);
      pending.length = 0;
    });
    upstream.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });
    upstream.on('close', (code) => {
      if (client.readyState === WebSocket.OPEN) client.close(code <= 1015 ? code : 1011);
    });
    upstream.on('error', () => {
      if (client.readyState === WebSocket.OPEN) client.close(1011, 'broker unreachable');
    });

    client.on('message', (data) => {
      const m = data.toString();
      if (upstreamOpen) upstream.send(m);
      else pending.push(m);
    });
    client.on('close', () => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close();
      }
    });
    client.on('error', () => upstream.close());
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`▲ ddx-term-web ready on http://${hostname}:${port}  (WS /term/* → ${brokerWsBase})`);
});
