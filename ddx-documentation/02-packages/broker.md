---
title: "ddx-term-broker"
description: The NestJS 11 broker — port 13330, the terminalId↔windowId registry, REST CRUD, a raw ws.Server per-terminal fan-out, and reconcileRegistry on restart.
audience: developers
tags: [broker, nestjs, websocket, control-mode, registry, reconcile]
updated: 2026-06-28
---

# `ddx-term-broker`

**Location:** `ddx-term-broker`
**Role:** the **human channel** and the owner of **canonical state**.
**Stack:** NestJS 11 (built with `nest build` + swc), Jest for tests.
**Port:** **13330** (`DDX_TERM_BROKER_PORT`; host `DDX_TERM_BROKER_HOST`, default `127.0.0.1`).
**Published:** No — `private`, `UNLICENSED`. Holds the PTY (`node-pty`) on the broker
side, which is correct: the broker is the control-mode attach point, the MCP is not.

## Responsibilities

1. **Attach to tmux in control-mode** (`tmux -CC`) and parse its output stream.
2. **Own the `terminalId ↔ windowId` registry** — the authoritative mapping.
3. **Expose REST CRUD** at `/api/v1/terminals`.
4. **Fan per-terminal output** to web clients over a raw `ws.Server`.
5. **Reconcile on restart** — re-adopt live tmux windows without killing the session.

## Boot sequence

`ddx-term-broker/src/main.ts` mirrors the canonical Dudoxx `ddx-api` boot order:

```
Helmet → CORS → global prefix (api/v1) → HttpExceptionFilter →
LoggingInterceptor → Swagger → listen → attach raw ws.Server to upgrade →
BootSummaryService.renderAll()
```

CORS origins come from `CORS_ORIGINS` (comma-separated env); there is no hardcoded
default in source.

## REST surface

Defined in `ddx-term-broker/src/modules/terminal/terminal.controller.ts`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/terminals` | Create a terminal (allocates a tmux window). |
| `GET` | `/api/v1/terminals` | List all terminals. |
| `GET` | `/api/v1/terminals/:id` | Get one terminal + refresh its snapshot. |
| `GET` | `/api/v1/terminals/:id/snapshot` | Capture the visible viewport. |
| `DELETE` | `/api/v1/terminals/:id` | Destroy a terminal. |

## The raw `ws.Server` — and why NOT `@WebSocketGateway`

The per-terminal WS path is `/term/<terminalId>`. NestJS's `@nestjs/platform-ws`
`WsAdapter` routes upgrades by **exact pathname match** and has no prefix/wildcard
mode — so it can never deliver a dynamic `/term/<terminalId>` URL to a gateway.

The broker therefore **owns the upgrade itself**:
`ddx-term-broker/src/modules/gateway/term.gateway.ts` instantiates a raw
`ws.Server({ noServer: true })` and attaches it to the Nest HTTP server's `upgrade`
event (after `listen()`, so `getHttpServer()` is the real listening server). It drives
`handleUpgrade` manually and matches the terminalId out of the path.

> This is a deliberate, documented deviation from the standard NestJS WS gateway
> pattern — the dynamic-path requirement forces it. `main.ts` intentionally does
> **not** call `useWebSocketAdapter`.

## Control-mode parsing

`ddx-term-broker/src/modules/control-mode/control-mode.parser.ts` turns the tmux
`-CC` output protocol into the typed `ServerFrame` shapes from `@ddx/term-contract`,
which the gateway then fans to the matching per-terminal subscribers.

## `reconcileRegistry()` — restart safety

`ddx-term-broker/src/modules/session/session.service.ts:429` defines
`reconcileRegistry()`, called during session bring-up
(`session.service.ts:108`). On a broker restart it lists the live tmux windows and
**re-adopts** each one into the `terminalId ↔ windowId` registry. The tmux session is
never killed — it is the durable state, and the broker is a stateless view that
rebuilds its registry from reality. Adoption failures are logged non-fatally.

## Build & test

```sh
pnpm --filter ddx-term-broker build       # nest build
pnpm --filter ddx-term-broker start:dev   # nest start --watch (hot reload)
pnpm --filter ddx-term-broker test        # jest --passWithNoTests
pnpm --filter ddx-term-broker tsc:check   # tsc --noEmit
```

Tests: `terminal.service.spec.ts`, `term.gateway.spec.ts`,
`session.service.spec.ts` (covers the restart/reconcile path),
`control-mode.parser.spec.ts`. No source TODOs.

## See also

- [Architecture](../00-overview/architecture.md) — the broker's place in the data flow.
- [Web package](./web.md) — the WS client that consumes the broker's fan-out.
- [Invariants](../04-development/invariants.md) — session pinning + `tmux -f /dev/null`.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
