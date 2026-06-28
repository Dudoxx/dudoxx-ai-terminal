# CLAUDE_PACKAGES.md — dudoxx-ai-terminal

> Referencable deep-dive (loaded on demand from `CLAUDE.md`). Per-package roles,
> entry points, build/test, and the MCP tool surface. Each package's own CLAUDE.md
> is the closer-wins authority for its local detail.

## Workspace packages (4) + e2e fixtures (2)

| Package | Scope | Published? | Build | Test |
|---|---|---|---|---|
| `@ddx/term-contract` | `packages/ddx-term-contract` | no (private, bundled) | tsc ×3 (esm/cjs/types) | vitest |
| `ddx-term-broker` | `ddx-term-broker` | no (private) | nest build | jest |
| `@dudoxx/ddx-term-mcp` | `ddx-term-mcp` | **yes (public npm)** | tsc / tsup bundle | vitest |
| `ddx-term-web` | `ddx-term-web` | no (private) | next build | vitest |
| `ddx-cli-ts` / `ddx-cli-py` | root | no (fixtures) | — | e2e targets only |

## @ddx/term-contract — the shared contract
Zod (v4) schemas: WS frames, MCP tool I/O (`TERM_TOOL_INPUT_SCHEMAS`), terminal +
session descriptors. Zero runtime logic. Triple build (ESM + CJS + types). The single
source of truth — broker/mcp/web NEVER redefine a frame or descriptor.
`private:true` + `UNLICENSED` by design: it is **bundled into the MCP** at publish time
(`tsup noExternal`), never published separately. See `packages/ddx-term-contract/CLAUDE.md`.

## ddx-term-broker — human channel + canonical state (NestJS 11)
Port **6481**, binds `127.0.0.1`. Owns the registry, REST CRUD (`/api/v1/terminals`,
`…/:id/snapshot`), and a **raw `ws.Server`** fan-out per terminalId (NOT
`@WebSocketGateway` — `@nestjs/platform-ws` routes upgrades by exact pathname and can't
serve `/term/<terminalId>`). `reconcileRegistry()` re-adopts live windows on restart.
Auth: none by design (localhost-only v1). See `ddx-term-broker/CLAUDE.md`.

## @dudoxx/ddx-term-mcp — agent channel (MCP stdio)
JSON-RPC 2.0 stdio server, thin tmux client via `execFile`, **zero PTY**. 10 tools.
Launched as `node dist/server.js` by the MCP client (not a dev server). The publish
bundle inlines the contract. See `ddx-term-mcp/CLAUDE.md`.

### The 10 MCP tools
| Tool | Purpose |
|---|---|
| `term_create` | Allocate a terminal (tmux window). Idempotent on existing slug. |
| `term_list` | List terminals + live process snapshots (panePid/fgPid/command/cwd). |
| `term_destroy` | Close a terminal + its processes. Default terminal is protected. |
| `term_send` | Type literal text; `enter:true` sends a SEPARATE Enter key. |
| `term_read` | New output since last read (delta); `since:"all"` for full capture. |
| `term_wait_for` | Block until a regex matches the visible pane or timeout. |
| `term_signal` | Send a control key (C-c/C-d/C-z), or kill a validated child pid. |
| `term_ps` | Resolve the terminal's live process tree for pid targeting. |
| `term_panes` | List panes (splits) within a terminal with dims + command. |
| `term_snapshot` | Capture the visible viewport grid — what is on screen right now. |

Full schemas + mechanics: `ddx-documentation/03-mcp-reference/tools.md`.

## ddx-term-web — human UI (Next.js 16)
Port **3460**. App Router, React 19, Tailwind v4, next-intl. One WS per terminalId;
tab switch = WS resubscribe + `GET …/:id/snapshot` → `restoreSnapshot()`, NOT a full
reconnect. Dudoxx frontend rules apply (semantic tokens, i18n lockstep, lucide-only).
See `ddx-term-web/CLAUDE.md`.

## Build order (turbo DAG)
`@ddx/term-contract` builds first; `broker` + `mcp` + `web` depend on it.
`pnpm test` dependsOn build; `pnpm typecheck` dependsOn `^build`.

## Per-package commands
See `ddx-documentation/04-development/build-and-test.md` for the full filter-command catalog.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
