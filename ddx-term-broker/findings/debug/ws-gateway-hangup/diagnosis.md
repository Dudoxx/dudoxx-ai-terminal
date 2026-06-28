# WS gateway hangup + no-frames — diagnosis

Two distinct, sequential bugs broke the per-terminal WebSocket path. Both fixed.

## Bug 1 — "socket hang up": WsAdapter exact-path routing can't match `/term/:id`

### Root cause
`@nestjs/platform-ws@11.1.27` `WsAdapter` routes upgrades by **exact** pathname
match. `node_modules/@nestjs/platform-ws/adapters/ws-adapter.js`
`ensureHttpServerExists()` upgrade handler:

```
for (const wsServer of wsServersCollection) {
  if (pathname === wsServer.path) { handleUpgrade(...) }   // EXACT ===
}
if (!isRequestDelegated) { socket.destroy(); }              // → "socket hang up"
```

`@WebSocketGateway({ cors })` (no `path`) registers `wsServer.path = normalizePath(undefined) = "/"`.
Client connects to `/term/<id>` → `pathname = "/term/<id>"` → `"/term/<id>" === "/"` is
false → `isRequestDelegated` stays false → `socket.destroy()` before `handleConnection`.
Removing the earlier `path:'/term'` did not help — the adapter has no prefix/wildcard
mode; it only ever does `===`, so `/term` and `/` both fail to match `/term/<id>`.

### Fix
Stop using the adapter for routing. `TermGateway` is now a plain `@Injectable()` that
owns a raw `ws.Server({ noServer: true })` and attaches to the Nest HTTP server's
`upgrade` event itself.
- `term.gateway.ts` — dropped `@WebSocketGateway`/`@WebSocketServer`/`OnGatewayInit`;
  added `attachTo(httpServer)` which matches `^/term/[^/?]+` and calls
  `server.handleUpgrade(...) → handleConnection`. Also wires `socket.on('close', …)`
  → `handleDisconnect` (the adapter used to do this).
- `main.ts` — removed `useWebSocketAdapter(new WsAdapter(app))`; after `app.listen()`
  calls `app.get(TermGateway).attachTo(app.getHttpServer())`.
- `gateway.module.ts` — `exports: [TermGateway]` so `app.get()` resolves it.

## Bug 2 — 0 frames delivered: pane-id vs window-id conflation in `%output` routing

### Root cause
tmux control-mode emits `%output %<pane-id> <data>` — a **pane** id (`%23`). But the
registry binds `terminalId ↔ windowId` (`@23`, from `#{window_id}`). `parseOutputLine`
(`control-mode.parser.ts`) cast the pane token straight to `WindowId` and resolved it
via `SessionService.resolveTerminalId` (window-keyed). `'%23'` never equals `'@23'`, so
EVERY `%output` frame resolved to `undefined` → `{kind:'unknown'}` → dropped. The code
comment claimed "the attach layer converts pane-id → windowId before calling us" — it
does **not**; `control-mode.attach.ts` passes the raw line straight through.

### Fix — pane→window→terminal hop in SessionService (no contract change)
`%output` is the only pane-keyed line; layout/window-add/window-close carry window ids.
Split the resolver so each line type uses the right one.
- `session.service.ts` — added `paneToWindow: Map<string, WindowId>`; populated on
  `createTerminal` (reads `#{pane_id}`), bulk-seeded on `onModuleInit` via `syncPaneMap`
  (`list-panes -s -F '#{pane_id} #{window_id}'` — handles a reused session), cleaned on
  `destroyTerminal`. New public `resolveTerminalIdByPane(paneId)` hops
  paneId → windowId → terminalId. PaneId kept a broker-internal plain `string`
  (panes are not modelled in `@ddx/term-contract`; no contract edit).
- `control-mode.parser.ts` — new `PaneIdResolver` + `FrameResolvers { resolveWindow,
  resolvePane }`. `parseControlModeLine` dispatches `%output` → `resolvePane`, the rest
  → `resolveWindow`. `parseOutputLine` now resolves the pane id (no `as WindowId` cast).
- `control-mode.attach.ts` — `start(resolvers: FrameResolvers, …)`; threads both.
- `term.gateway.ts` `onApplicationBootstrap` — passes `{ resolvePane: …ByPane,
  resolveWindow: …resolveTerminalId }`.
- `control-mode.parser.spec.ts` — rewritten to the two-resolver API; `%output` fixtures
  use real pane ids (`%1`/`%2`); added a regression test that a window id in an `%output`
  line is dropped by the pane resolver.

## Verification (Node 22)
- `pnpm -F ddx-term-broker tsc:check` — clean.
- `pnpm -F ddx-term-broker build` (SWC) — 22 files compiled.
- `pnpm -F ddx-term-broker test -- control-mode.parser` — 16/16 pass.
- Live repro on `:6481` against tmux `ddx-shared`:
  - `OPEN` fires; `handleConnection` runs (`Client subscribed to terminalId=dbg`).
  - Multiple `FRAME:` payloads arrive; `data` contains the echoed command.
  - Token round-trip test: sent `echo PROOF_TOKEN_42`, asserted the decoded frame
    output contained `PROOF_TOKEN_42` → `SAW_ECHOED_TOKEN=true`, `FRAMES_RECEIVED=4`.
  - Log: `Pane map synced — 11 pane(s)`, `Terminal created: dbg → @23 (pane=%23, …)`,
    `TermGateway attached to HTTP upgrade on /term/:terminalId`.

## Files changed
- `src/main.ts`
- `src/modules/gateway/term.gateway.ts`
- `src/modules/gateway/gateway.module.ts`
- `src/modules/session/session.service.ts`
- `src/modules/control-mode/control-mode.parser.ts`
- `src/modules/control-mode/control-mode.attach.ts`
- `src/modules/control-mode/control-mode.parser.spec.ts`
