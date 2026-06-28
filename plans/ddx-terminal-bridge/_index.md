# Plan — ddx-terminal-bridge

Status: RECONCILED
Scope: ddx-terminal-bridge · Execution model: parallel (groups A→B→C→D) · Tasks: 9 · Shards: 7

## Context
Build a stateful, shared multi-terminal system: ONE persistent tmux session is the single source of
truth hosting MANY addressable terminals (one tmux window each, stable `terminalId`, transient `pid`),
attached simultaneously by a human (web/xterm.js) and an AI agent (MCP — the user-locked channel). The
render path (control-mode → WebSocket → xterm.js) is channel-INDEPENDENT from MCP. The MCP server is a
thin client over tmux and NEVER owns a PTY. Deliverable: a NEW pnpm workspace with `@ddx/term-contract`
+ `ddx-term-broker` (NestJS 11) + `ddx-term-mcp` (stdio MCP) + `ddx-term-web` (Next.js 16), day-zero
runnable, with unit + e2e tests. Authority order: **In-Session/spec-bundle (Tier-0) > declared
source-of-truth (tmux-as-truth, MCP-never-owns-a-PTY) > repo precedent (HMS siblings) > generic tutorials.**

## Acceptance Criteria (lifted from discuss.md — EARS)
1. WHEN a human types in the web terminal THE SYSTEM SHALL execute it in the shared tmux session, output <150ms p95 localhost.
2. WHEN the agent calls term_send THE SYSTEM SHALL inject into the SAME session the human is attached to.
3. WHEN the agent calls term_read THE SYSTEM SHALL return the exact pane scrollback the human sees.
4. WHEN either party runs a stateful sequence (cd then pwd; REPL) THE SYSTEM SHALL preserve state across calls.
5. WHEN a client disconnects/reconnects THE SYSTEM SHALL restore the live session with full scrollback.
6. WHEN term_wait_for(pattern,timeout) is called THE SYSTEM SHALL block until pattern or timeout, reporting which.
7. WHEN a TUI runs (vim/htop/less) THE SYSTEM SHALL render it via control-mode %output/%layout-change, not screen-scrape.
8. WHEN the human resizes THE SYSTEM SHALL NOT shrink the session below the pinned size.
9. WHEN two parties type concurrently THE SYSTEM SHALL apply input arbitration (default: agent own window; human window 0).
10. THE SYSTEM SHALL ship co-located unit tests + e2e proving 3-way attach parity and multi-terminal isolation.
11. THE SYSTEM SHALL expose the MCP server over stdio JSON-RPC registrable in a .mcp.json.
12. WHEN term_create is called THE SYSTEM SHALL allocate a NEW terminal with a stable terminalId; term_list enumerates all; no cross-terminal leakage.
13. WHEN term_list/term_ps is called THE SYSTEM SHALL report panePid + fgPid as live snapshots distinct from terminalId.
14. WHEN term_signal(terminalId,sig,pid) targets a pid THE SYSTEM SHALL validate it belongs to the terminal's tree, rejecting otherwise.
15. WHEN term_snapshot is called THE SYSTEM SHALL return the visible viewport grid (capture-pane no -S) reporting pane_width x pane_height; term_read returns the scrollback DELTA.

## Boundaries
- In scope: shared contract, MCP server (9 verbs + 2 helpers), NestJS broker (tmux session + registry +
  control-mode + WS + PID resolution), Next.js web (xterm + tabs + snapshot), resize/input arbitration,
  observability, unit + e2e tests, workspace scaffold, per-package CLAUDE.md.
- NOT (v2 / out): E2E encryption · SSO/RBAC/multi-tenant auth · hosted/cloud relay · session
  recording/asciinema · collaboration UX polish (live cursors/predictive echo/presence) · Windows-native
  · infinite-canvas tiling · multiple SESSIONS (multiple terminals in ONE session IS in scope).
- Paths NOT to touch: `ddx-cli-py/`, `ddx-cli-ts/` (e2e fixtures — read/run only, never edit/delete).

## Pattern Basis (MANDATORY reuse — mined HMS siblings, all confirmed on disk)
| New package/file | Mirrors (HMS sibling) | What is reused |
|---|---|---|
| `@ddx/term-contract` | `dudoxx-ai-hms/packages/ddx-sse-contract` (real `@ddx/sse-contract` v4.1.0) | multi-target esm/cjs/types build, exports map, schema-lock.json + CHANGELOG.md, peerDeps zod ^4, vitest |
| `ddx-term-mcp` | `dudoxx-ai-hms/ddx-fhir-r4-mcp` (stdio MCP, server.ts + thin client) | @modelcontextprotocol/sdk stdio shape, type:module, bin entry, dev=tsx (NO inlined zod — import contract; NO node-pty) |
| `ddx-term-broker` | `dudoxx-ai-hms/ddx-api` (nest-cli.json + main.ts + platform/common) | Helmet/Swagger/ZodValidationPipe boot, HttpExceptionFilter/LoggingInterceptor/pino/BootSummaryService, modules/+platform/ split |
| `ddx-term-web` | `dudoxx-ai-hms/ddx-web` (Next 16 app shell) | app shell skeleton + OKLCH tokens (CLI UI scope — no full entity-route pattern) |
| workspace root | this repo IS its own pnpm workspace | pnpm-workspace.yaml + root package.json + turbo |
| skills | `create-nestjs`, `create-nextjs` | day-zero skeletons for broker + web |

## Implementation Order
| Shard | Layer | Agent | Skills | Parallel? |
|---|---|---|---|---|
| 01-workspace-scaffold (A1) | workspace root | general-purpose | typescript-strict | No — blocks all |
| 02-term-contract (A2) | shared contract | general-purpose | typescript-strict | No — blocks B/C/D |
| 03-term-mcp (B1,B2) | MCP server | general-purpose | typescript-strict | Yes (Group B) — B2 after B1 |
| 04-term-broker (B3,B4) | NestJS broker | nestjs-backend-specialist | create-nestjs, nestjs-backend, typescript-strict | Yes (Group B) — B4 after B3 |
| 06-registry-ownership | architectural note (folds into B1/B3/B4) | — | — | — |
| 05-term-web (C1) | Next.js web | stack-specialist | create-nextjs, frontend-stack, typescript-strict | No (single task) — after Group B |
| 07-e2e-docs (D1,D2) | e2e + DOX docs | test-writer (D1), general-purpose (D2) | typescript-strict | Yes (Group D) — D1/D2 independent |

Groups: **A** {A1,A2} → **B** {B1,B2,B3,B4} → **C** {C1} → **D** {D1,D2}. Largest parallel group = 4 (B) →
**use `/team-execute`**.

## Reciprocal Pairs (round-trip coverage — every emit/open half has its consume/close)
| Produces / opens half | Reciprocal (consume / caller / close) | Shards |
|---|---|---|
| WS `/term/:terminalId` server gateway emits frames (B4) | xterm WS client consumes frames (C1) | 04 ↔ 05 |
| client `input` frame emitted (C1) | gateway ingests → send-keys (B4) | 05 ↔ 04 |
| REST `POST /terminals` (B4) + MCP `term_create` (B2) | web "new tab" caller (C1) | 04/03 ↔ 05 |
| REST `DELETE /terminals/:id` (B4) + MCP `term_destroy` (B2) | web close-tab caller (C1) | 04/03 ↔ 05 |
| `term_create` allocates terminalId + writes registry (B2/B3) | `term_destroy` frees it + clears cursor (B2/B3) | open/close pair |
| control-mode `%output` produced by attach (B4) | WS gateway broadcast consumes it (B4) | intra-04 |
| broker-owned registry written (B3) | MCP resolves terminalId→windowId via REST (B1) | 04 ↔ 03 (shard 06) |

## Cross-Service Authorizations
None — each task stays within its package boundary. The broker REST/WS is the only cross-package seam and
is consumed via the published contract + HTTP/WS, not by editing another package's files.

## All Files
See each task's `files.create` in tasks.json. Top-level new roots: `packages/ddx-term-contract/`,
`ddx-term-broker/`, `ddx-term-mcp/`, `ddx-term-web/`, `e2e/`, root (`pnpm-workspace.yaml`, `package.json`,
`turbo.json`, `tsconfig.base.json`, `docker-compose.dev.yml`, `README.md`, `.mcp.json.example`), per-package
`CLAUDE.md`.

## Research Sources
- `plans/ddx-terminal-bridge/{discuss,ARCHITECTURE,FEATURES,MCP-SPEC,RESPONSIVENESS,SPIKE}.md` (authoritative spec bundle).
- `findings/2026-06-28_stateful-terminal-agent-bridge/_index.md` (prior-art survey: sshx/ttyd/tmux-mcp/control-mode).
- HMS siblings (verified on disk): ddx-sse-contract, ddx-fhir-r4-mcp, ddx-api, ddx-web.

> **EARS note:** most task AC use the event-driven form (`WHEN … THE SYSTEM SHALL …`). Five AC are
> intentionally **ubiquitous-form** EARS (`THE SYSTEM SHALL …`) for always-true invariants/deliverables
> with no trigger event — the no-`node-pty` grep invariant (B1), the contract-uniqueness rule (A2), and
> three doc deliverables (D2). This is a valid EARS category, not a missing trigger.

## Verification (each AC → its proving test)
| AC | Verified by |
|---|---|
| 1 (latency <150ms) | D1 `e2e/latency.e2e.spec.ts` (p50/p95 report, CI gate) |
| 2 (agent send → shared session) | D1 `attach-parity.e2e.spec.ts` + B2 term_send spec |
| 3 (read = human scrollback parity) | D1 `attach-parity.e2e.spec.ts` |
| 4 (statefulness cd/pwd, REPL) | D1 `statefulness.e2e.spec.ts` |
| 5 (reconnect restores scrollback) | B3 `session.service.spec.ts` (re-attach) |
| 6 (term_wait_for) | B2 `term-wait-for` spec + D1 interactive test |
| 7 (TUI via control-mode) | B4 `control-mode.parser.spec.ts` + D1 interactive (clack/rich) |
| 8 (resize invariant) | D1 `resize-invariant.e2e.spec.ts` + B3 session spec |
| 9 (input arbitration: agent own window) | B4 `term.gateway.spec.ts` |
| 10 (unit + e2e parity/isolation) | all `*.spec.ts` + D1 suite |
| 11 (MCP over stdio, .mcp.json) | B2 `server.e2e.spec.ts` + D2 `.mcp.json.example` |
| 12 (term_create + isolation) | D1 `multi-terminal-isolation.e2e.spec.ts` + B4 REST CRUD spec |
| 13 (panePid/fgPid snapshots ≠ terminalId) | B3 `session.service.spec.ts` (PID resolution) |
| 14 (term_signal pid validation) | D1 `terminalid-vs-pid.e2e.spec.ts` + B2 term_signal spec |
| 15 (snapshot visible grid vs read delta) | B1/B2 capture specs + D1 `delta-read.e2e.spec.ts` |

## AC Results Matrix (post-execution verification — 2026-06-28)
> Evidence: turbo build 4/4, turbo test 9/9, typecheck 5/5 packages CLEAN, 124 tests
> (contract 20 · mcp 36 · broker 44 · web 5 · e2e 19), MCP launches under plain `node`.

| AC | Status | Evidence |
|---|---|---|
| 1 latency <150ms p95 | **PASS** | e2e latency: p95 send→visible=12ms, read=5ms (well under ceiling) |
| 2 agent send → shared session | **PASS** | attach-parity.e2e + term-send spec (send-keys -l + separate Enter) |
| 3 read = human scrollback parity | **PASS** | attach-parity.e2e (second capture-pane client sees same bytes) |
| 4 statefulness (cd/pwd, REPL) | **PASS** | statefulness.e2e |
| 5 reconnect restores scrollback | **PASS** | session.service.spec re-attach (tmux survives disconnect) |
| 6 term_wait_for | **PASS** | term-wait-for spec + interactive.e2e (wait-before-answer) |
| 7 TUI via control-mode | **PASS** | control-mode.parser.spec + interactive.e2e (rich/clack) |
| 8 resize invariant | **PASS** | resize-invariant.e2e (headless attach doesn't shrink window) |
| 9 input arbitration (agent own window) | **PASS** | term.gateway.spec (window 0 human, agent 1+) |
| 10 unit + e2e parity/isolation | **PASS** | 124 tests across 5 packages |
| 11 MCP over stdio, .mcp.json | **PASS** | MCP launches under `node dist/server.js`; .mcp.json.example valid |
| 12 term_create + isolation | **PASS** | multi-terminal-isolation.e2e + WS cross-terminal-injection spec (sec HIGH-1 fix) |
| 13 panePid/fgPid snapshots ≠ terminalId | **PASS** | session.service.spec (distinct snapshots) |
| 14 term_signal pid validation | **PASS** | terminalid-vs-pid.e2e + term-signal spec (full descendant-tree containment, sec HIGH-2 fix) |
| 15 snapshot grid vs read delta | **PASS (delta cap-bound deferred)** | delta-read.e2e + capture specs. NOTE: delta saturates at 2000-line scrollback cap (deferred — see SUMMARY) |

**15/15 AC PASS.** AC#15 carries one disclosed limitation (read-cursor delta at the cap boundary) —
proven under normal load, deferred fix tracked for /unify.

## Quality Gates (2026-06-28)
- **code-reviewer**: APPROVE-WITH-NITS — no _invariants.md rule violated. W1 (snapshot field mismatch, silent runtime bug) FIXED; W2 (no-auth) documented in broker CLAUDE.md.
- **security-reviewer**: PASS-WITH-NOTES — command-injection CLEAN (execFile argv + -l literal). HIGH-1 (WS cross-terminal injection) + HIGH-2 (shallow pid-tree) FIXED; cheap MEDs (WS cors, title bound) FIXED; logging-only MEDs deferred.

## Critical Pitfalls (also in _invariants.md — read first)
1. `window-size manual` + new-window on detached session → tmux server death. Use `default-size`. (SPIKE)
2. Inheriting `~/.tmux.conf` breaks scripted ops. Use `tmux -f /dev/null`. (SPIKE)
3. MCP owning a PTY (node-pty) breaks shared state — the webmux trap. No node-pty dep. (FM#1)
4. Resize war: headless attach collapses the human viewport. Pin size + broker owns canonical dims. (FM#2)
5. Output flood / token blowout: full scrollback every read. Delta-by-default + term_wait_for. (FM#3)
6. terminalId/pid conflation: validate pid ∈ terminal tree before kill; terminalId↔windowId is the only durable binding. (FM#4)
7. Send mechanics: `send-keys -l` text + SEPARATE Enter; TUI arrows via KEY NAMES; term_wait_for before answering prompts. (SPIKE Spike 2)

## Resume Protocol
tasks.json is the source of truth. Resume from the first `status: pending` task; honor `depends_on` +
`parallel_groups`; re-read `_invariants.md` before any edit. Largest parallel group = 4 → `/team-execute`.

Next: /team-execute plans/ddx-terminal-bridge/_index.md
