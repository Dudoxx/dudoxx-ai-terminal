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
- `dotenv` `^16.4` — loads `.env` (CWD + `~/.ddx-term/.env`) for the standalone `pnpm dev` path.
- **`node-pty` `^1.1`** — allocates a real pty so `tmux -CC attach` succeeds (control-mode).
  This is the SHARED-session attach, not a private PTY — see `context/_invariants.md` scope note.

## @dudoxx/ddx-term-mcp (MCP stdio)
- `@modelcontextprotocol/sdk` `^1.12`, `zod` `^4.3`, `dotenv` `^16.4`
- `dotenv` loads `.env` layers (`src/load-dotenv.ts`) before resolving ports / spawning the
  stack; it is bundled into `dist/server.js` (tsup), so the published tarball stays self-contained.
- **No `node-pty`** — by invariant (`no-pty.spec.ts` enforces). Shells to tmux via `execFile`.
- `@ddx/term-contract` is a `workspace:*` devDep, bundled into `dist/server.js` at publish.

## ddx-term-web (Next.js 16)
- `next` `16.2.6`, `react`/`react-dom` `^19.2`, `next-intl` `^4.12`
- `@xterm/xterm` `^5.5` + addons (`addon-fit` `^0.10`, `addon-web-links` `^0.11`, `addon-webgl` `^0.18`)
- `ws` `^8.21`, `zod` `^4.3`, `dotenv` `^16.4` (loaded in `server.mjs` for the standalone path)

## Ports
Defaults live in the high **133XX** band — chosen to avoid colliding with common dev servers
(`3000`/`5173`/`8080`). Single source of truth: `packages/ddx-term-contract/src/ports.ts`
(`DEFAULT_BROKER_PORT` / `DEFAULT_WEB_PORT`); `resolvePorts(env)` applies overrides.

| Service | Port / transport | Env override |
|---|---|---|
| ddx-term-broker | HTTP/WS `13330` (binds `127.0.0.1`) | `DDX_TERM_BROKER_PORT` / `DDX_TERM_BROKER_HOST` / `DDX_TERM_HOST` |
| ddx-term-web | HTTP `13340` | `DDX_TERM_WEB_PORT` (child also reads `PORT`) |
| ddx-term-mcp | stdio (no port) | — |
| tmux session | socket `/tmp/ddx-term.sock`, session `ddx-shared` | `DDX_TERM_SOCKET` / `DDX_TERM_SESSION` |

## MCP env-var contract (`@dudoxx/ddx-term-mcp`)
| Var | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket of the shared session |
| `DDX_TERM_SESSION` | `ddx-shared` | session hosting all terminals (windows) |
| `DDX_TERM_DEFAULT` | `t01` | terminalId used when a verb omits `terminalId` |
| `DDX_TERM_BROKER_PORT` | `13330` | broker HTTP/WS port (resolved via `resolvePorts`) |
| `DDX_TERM_WEB_PORT` | `13340` | web UI HTTP port |
| `DDX_TERM_HOST` | `127.0.0.1` | bind/connect host for broker + web (loopback by design) |
| `DDX_TERM_WEB` | (unset → web on) | set `0` → supervisor skips spawning the web tier (headless) |
| `DDX_TERM_ALLOWLIST` | (unset) | optional command allow-list |
| `DDX_TERM_MAX_READ_LINES` | `2000` | hard cap on `term_read` scrollback per call |
| `DDX_TERM_MAX_TERMINALS` | `16` | max terminals the agent may allocate |
| `DDX_TERM_BROKER_URL` / `_WS` / `BROKER_BASE_URL` | (written by supervisor) | set automatically after the broker spawns; set by hand only to attach to an already-running broker |

> **Pitfall**: if you set `DDX_TERM_BROKER_URL` manually it MUST include the `/api/v1` broker
> prefix, or registry resolution fails silently. In supervisor auto-spawn mode it is written
> for you with the correct prefix.

### Override layers (`.env`)
Settings resolve through three layers (highest wins, `override: false` so an explicit env var
always beats a file):

1. **MCP client `env:` block** (`.mcp.json` / `claude mcp add --env`) — per agent / per client.
2. **Project-local `.env`** (current working directory).
3. **Global `~/.ddx-term/.env`** — every client on the machine.

Loaders: `ddx-term-mcp/src/load-dotenv.ts` (runs before `resolvePorts`/`ensureStack`), plus
`ddx-term-broker/src/main.ts` and `ddx-term-web/server.mjs` for the standalone `pnpm dev`
path. Template: [`.env.example`](./.env.example) (gitignored real `.env`).

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
