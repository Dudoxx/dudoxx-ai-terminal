---
title: "ddx-term-web"
description: The Next.js 16 web UI — xterm.js terminals, one WS per terminalId via a custom server WS proxy, and snapshot restore on tab switch.
audience: developers
tags: [web, nextjs, xterm, websocket, custom-server, snapshot]
updated: 2026-06-28
---

# `ddx-term-web`

**Location:** `ddx-term-web`
**Role:** the **human channel** UI — renders the shared terminals with xterm.js.
**Stack:** Next.js 16 App Router, React 19, Tailwind v4, next-intl (en/de/fr).
**Port:** **13340** (`PORT`).
**Published:** No — `private`, `UNLICENSED`.

## Custom server (not plain `next dev`)

`ddx-term-web/server.mjs` is a **custom Next.js server** because Next's default
`next dev` / `next start` does **not** handle WebSocket `upgrade` requests, and
`next.config` `rewrites` proxy only HTTP — never the upgrade handshake.

The custom server:

1. Runs the Next request handler for all HTTP (pages, `/api` rewrites, assets).
2. Intercepts `upgrade` events matching `/term/<terminalId>` and bridges them to the
   broker's WS (`DDX_TERM_BROKER_WS`, default `ws://127.0.0.1:13330`), piping frames
   both ways.

This keeps the browser on a **single origin** — it connects same-origin
(`ws://<host>/term/<id>`), so the setup works under HTTPS with no exposed broker port
and no mixed-content. The broker WS origin stays server-side only and is never shipped
to the browser. Next's own HMR websocket (and any non-`/term/` upgrade) is left to
Next.

```sh
pnpm --filter ddx-term-web dev    # NODE_ENV=development node server.mjs (port 13340)
```

## The xterm.js client

`ddx-term-web/src/lib/term/xterm-client.ts` defines `XtermClient` — one instance per
`terminalId`:

- **Server → client:** `ServerFrame` JSON → writes output bytes / applies layout.
- **Client → server:** xterm `onData(key)` → `InputFrame` JSON → broker →
  tmux `send-keys -l`.
- **Frame types** are imported **only** from `@ddx/term-contract`
  (`ServerFrameSchema`, `InputFrameSchema`) — never redefined here.
- **Theme:** xterm.js cannot consume OKLCH / CSS `var()`, so the client resolves hex
  mirror CSS vars (`--xterm-bg-hex`, etc.) declared in `globals.css @theme` at mount.

### Tab switch = resubscribe + snapshot restore

Switching terminals is **not** a full reconnect. The client `dispose()`s the old
`XtermClient`, constructs a new one for the next `terminalId`, and calls
`restoreSnapshot(snapshotText)` to paint the current frame **before** the first live
frame arrives. This gives an instant, populated terminal on tab switch instead of a
blank pane waiting for output.

## Source layout

`ddx-term-web/src/`:

| File | Role |
|---|---|
| `app/[locale]/layout.tsx` | Locale-scoped root layout (next-intl). |
| `app/[locale]/terminal/page.tsx` | The terminal UI page. |
| `app/page.tsx` | Root redirect into the locale. |
| `lib/term/xterm-client.ts` | `XtermClient` — WS plumbing + snapshot restore. |
| `i18n/routing.ts`, `i18n/request.ts` | next-intl routing + request config (en/de/fr). |
| `proxy.ts` | HTTP proxy helper for `/api` → broker REST. |

## Build & test

```sh
pnpm --filter ddx-term-web dev          # custom WS-proxy server, port 13340
pnpm --filter ddx-term-web build        # next build
pnpm --filter ddx-term-web typecheck    # tsc --noEmit
pnpm --filter ddx-term-web lint         # next lint
pnpm --filter ddx-term-web test         # vitest run
```

Test: `xterm-client.spec.ts` (currently has expected stubs). i18n covers en/de/fr.

## See also

- [Broker package](./broker.md) — the WS fan-out + REST this client consumes.
- [Architecture](../00-overview/architecture.md) — the human channel data flow.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
