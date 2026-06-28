# Dependencies & Configuration — dudoxx-ai-terminal

System prerequisites, per-package runtime deps, and the MCP env-var contract.

## System prerequisites
| Tool | Version | Notes |
|---|---|---|
| Node.js | `>= 20.9.0` | `engines.node` in every package |
| pnpm | `10.24.0` | pinned via root `packageManager` |
| tmux | `>= 3.3` (tested 3.6a) | the shared session substrate; must be on `PATH` |

## Toolchain (root devDependencies)
- `turbo` `^2.5.4` — task runner / build DAG
- `typescript` `5.7.x` — strict mode everywhere
- `@changesets/cli` `^2.31.0` — versioning + publish

## @ddx/term-contract
- runtime: none (zod is a `peerDependency` `^4.0.0`)
- the single source of truth for WS frames + MCP tool I/O + descriptors

## ddx-term-broker (NestJS 11)
- `@nestjs/{common,core,platform-express,platform-ws,websockets,swagger}` `^11.0.0`
- `helmet` `^8`, `rxjs` `^7.8`, `ws` `^8.18`, `zod` `^4.3`, `reflect-metadata` `^0.2`
- **`node-pty` `^1.1`** — allocates a real pty so `tmux -CC attach` succeeds (control-mode).
  This is the SHARED-session attach, not a private PTY — see `context/_invariants.md` scope note.

## @dudoxx/ddx-term-mcp (MCP stdio)
- `@modelcontextprotocol/sdk` `^1.12`, `zod` `^4.3`
- **No `node-pty`** — by invariant (`no-pty.spec.ts` enforces). Shells to tmux via `execFile`.
- `@ddx/term-contract` is a `workspace:*` devDep, bundled into `dist/server.js` at publish.

## ddx-term-web (Next.js 16)
- `next` `16.2.6`, `react`/`react-dom` `^19.2`, `next-intl` `^4.12`
- `@xterm/xterm` `^5.5` + addons (`addon-fit` `^0.10`, `addon-web-links` `^0.11`, `addon-webgl` `^0.18`)
- `ws` `^8.21`, `zod` `^4.3`

## Ports
| Service | Port / transport | Env override |
|---|---|---|
| ddx-term-broker | HTTP/WS `6481` (binds `127.0.0.1`) | `DDX_TERM_BROKER_PORT` / `DDX_TERM_BROKER_HOST` |
| ddx-term-web | HTTP `3460` | — (`next dev --port 3460`) |
| ddx-term-mcp | stdio (no port) | — |
| tmux session | socket `/tmp/ddx-term.sock`, session `ddx-shared` | `DDX_TERM_SOCKET` / `DDX_TERM_SESSION` |

## MCP env-var contract (`@dudoxx/ddx-term-mcp`)
| Var | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket of the shared session |
| `DDX_TERM_SESSION` | `ddx-shared` | session hosting all terminals (windows) |
| `DDX_TERM_DEFAULT` | `t01` | terminalId used when a verb omits `terminalId` |
| `DDX_TERM_ALLOWLIST` | (unset) | optional command allow-list |
| `DDX_TERM_MAX_READ_LINES` | `2000` | hard cap on `term_read` scrollback per call |
| `DDX_TERM_MAX_TERMINALS` | `16` | max terminals the agent may allocate |
| `DDX_TERM_BROKER_URL` | (unset) | set → broker-attached mode (MUST include the `/api/v1` prefix); unset → standalone slug↔window map |

> **Pitfall**: `DDX_TERM_BROKER_URL` MUST include the `/api/v1` broker prefix, or registry
> resolution fails silently.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
