# Verdict: FAIL ❌ (security) — broker WS cross-terminal injection + WS CORS

| Field | Value |
|-------|-------|
| Task ref | B4 (term.gateway, terminal.controller) |
| Reviewer | security-reviewer (PASS-WITH-NOTES; these are the in-scope HIGH/MED fixes) |
| Attempt | 1 of 3 |

## Issue 1 — HIGH — Cross-terminal input injection (violates AC#12 isolation — IN SCOPE, not an accepted v1 risk)
- **File**: `ddx-term-broker/src/modules/gateway/term.gateway.ts` (~line 195-210, `handleClientMessage` → `handleInputFrame`)
- **Cause**: `handleInputFrame(socket, parsed.terminalId, ...)` routes send-keys using the terminalId from
  the MESSAGE BODY, never compared to the socket's SUBSCRIBED terminalId
  (`this.connections.get(socket)` → `Subscription.terminalId`). A client subscribed to terminal A can
  inject `{type:'input', terminalId:'<terminal B>', data:'...', enter:true}` and drive terminal B.
  This breaks per-terminal isolation (AC#12) — the plan's headline guarantee. The "no auth" v1 scope-out
  does NOT cover this: even unauthenticated, a socket must not escape its own terminal.
- **Fix**: in `handleClientMessage`, before dispatching an input frame, look up the socket's subscription
  (`const sub = this.connections.get(socket)`) and assert `sub && sub.terminalId === parsed.terminalId`.
  On mismatch: log a warning + `socket.close(1008, 'terminalId mismatch')` (policy violation) and return —
  do NOT send the keystrokes. The `_socket` param of handleInputFrame becomes used (drop the `_`).
- **Verify**: add a gateway spec — a socket subscribed to A sending an input frame for B → keystrokes
  NOT sent to B + socket closed 1008. (Extends term.gateway.spec.ts.)

## Issue 2 — MEDIUM — WS gateway has no CORS / origin check
- **File**: `ddx-term-broker/src/modules/gateway/term.gateway.ts:73` (`@WebSocketGateway({ path: '/term' })`)
- **Cause**: NestFactory global CORS does NOT apply to raw ws:// upgrades. Any origin can open a WS conn.
  Bounded now by the 127.0.0.1 default bind, but a latent footgun if HOST=0.0.0.0.
- **Fix**: add `cors: { origin: <corsOrigins from env, same source main.ts uses> }` to the
  `@WebSocketGateway` decorator options. Read how main.ts derives corsOrigins and reuse that.

## Issue 3 — MEDIUM — POST /api/v1/terminals has no ValidationPipe / title bound
- **File**: `ddx-term-broker/src/modules/terminal/terminal.controller.ts` (POST handler, ~line 32)
- **Cause**: `@Body() body: Partial<CreateTerminalDto>` with no pipe — arbitrary payload; `title` flows into
  tmux `new-window -n <title>` (argv array, NOT injectable, but unbounded length).
- **Fix**: apply a validation that bounds `title` length (e.g. a Zod schema via the project's
  ZodValidationPipe, max ~64 chars, optional). Keep it consistent with how other DTOs validate via
  @ddx/term-contract. Do NOT loosen — bound it.

## Out of scope for THIS fix (defer to /unify as noted improvements — pure logging, low risk)
- main.ts empty-CORS-origins startup WARN, allow-list-unset startup WARN. Note only; not blocking.

## Re-validation gate (ALL exit 0)
`pnpm -F ddx-term-broker build && pnpm -F ddx-term-broker test && pnpm -F ddx-term-broker tsc:check`
Plus: the new isolation spec proves a spoofed-terminalId input is rejected.

## Do NOT touch
ddx-term-mcp/ (secfix-mcp owns the pid-tree fix), packages/, ddx-term-web/, fixtures, root.
Append recovery notes to progress/B4.md.

Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
