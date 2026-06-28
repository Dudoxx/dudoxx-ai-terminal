# Installation — dudoxx-ai-terminal

End-to-end install for the shared multi-terminal bridge. For the full coder docs see
[`ddx-documentation/01-getting-started/`](./ddx-documentation/01-getting-started/installation.md).

## Prerequisites
| Tool | Version | Why |
|---|---|---|
| Node.js | `>= 20.9.0` | runtime (ESM, broker, web) |
| pnpm | `10.24.0` (pinned via `packageManager`) | workspace package manager |
| tmux | `>= 3.3` (tested on 3.6a) | the shared-session substrate |
| git | any recent | clone |

Install pnpm if needed: `corepack enable && corepack prepare pnpm@10.24.0 --activate`.
A terminal emulator with native tmux control-mode (iTerm2 / WezTerm) is optional — only
needed for the native human-attach path.

## Clone + install
```sh
git clone git@github.com:Dudoxx/dudoxx-ai-terminal.git
cd dudoxx-ai-terminal
pnpm install            # installs all workspace packages + builds the contract on prepare
```

## Build
```sh
pnpm build              # turbo: @ddx/term-contract → broker + mcp + web
# or just the MCP server + its contract dep (for MCP registration):
pnpm --filter @dudoxx/ddx-term-mcp... build
```

## Verify the install
```sh
pnpm typecheck
pnpm lint
pnpm test               # unit + e2e (e2e spins a throwaway tmux on a temp socket)
```

## Ports — the 133XX band (no collision with your own dev servers)
The stack defaults to **`13330`** (broker) and **`13340`** (web). These high ports were
chosen deliberately to stay clear of the common dev ranges (`3000`/`3001` Next, `5173`
Vite, `8080`, …) so the bridge never fights your running codebases. Both are overridable —
see [Configuration](#configuration) below.

| Service | Default | Bind host | Override env |
|---|---|---|---|
| ddx-term-broker | HTTP/WS `13330` | `127.0.0.1` | `DDX_TERM_BROKER_PORT` / `DDX_TERM_HOST` |
| ddx-term-web | HTTP `13340` | `127.0.0.1` | `DDX_TERM_WEB_PORT` |
| ddx-term-mcp | stdio (no port) | — | — |

The single source of truth for both defaults is
[`packages/ddx-term-contract/src/ports.ts`](./packages/ddx-term-contract/src/ports.ts)
(`DEFAULT_BROKER_PORT` / `DEFAULT_WEB_PORT`) — every process resolves through it.

## Register the MCP server (agent channel)
After `pnpm build`, register `dist/server.js` with your MCP client. Two forms:

**Per-project `.mcp.json`** (copy `.mcp.json.example`, replace `/abs/path`):
```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "node",
      "args": ["/abs/path/dudoxx-ai-terminal/ddx-term-mcp/dist/server.js"],
      "env": {
        "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
        "DDX_TERM_SESSION": "ddx-shared",
        "DDX_TERM_DEFAULT": "t01",
        "DDX_TERM_BROKER_PORT": "13330",
        "DDX_TERM_WEB_PORT": "13340"
      }
    }
  }
}
```

**User scope (all projects)**:
```sh
pnpm -F @dudoxx/ddx-term-mcp build
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  --env DDX_TERM_BROKER_PORT=13330 \
  --env DDX_TERM_WEB_PORT=13340 \
  -- node "$PWD/ddx-term-mcp/dist/server.js"
```
Verify: `claude mcp list` → `ddx-term … ✔ Connected`.

> Once `@dudoxx/ddx-term-mcp` is released to npm, `npx -y @dudoxx/ddx-term-mcp` works as the
> `command` and no local build is needed. See [`CLAUDE_PUBLISHING.md`](./CLAUDE_PUBLISHING.md).

## The MCP server bootstraps the whole stack (no manual `pnpm dev` needed)
On the **first `term_*` verb call**, the MCP server's supervisor guarantees the stack is
live — it is a machine-wide singleton:

1. Spawns **ddx-term-broker** on `13330` (lock-protected; foreign process on the port →
   explicit `PORT_CONFLICT`, never a silent attach).
2. Spawns **ddx-term-web** on `13340` — unless `DDX_TERM_WEB=0` (headless / broker-only).
3. Writes `DDX_TERM_BROKER_URL` + `DDX_TERM_BROKER_WS` + `BROKER_BASE_URL` into the env so
   the MCP attaches to the broker it just started.

Lock files live in `~/.ddx-term/{broker,web}.lock`; concurrent MCP processes elect ONE
spawner (losers poll health). So a new machine only needs `tmux` + Node + the registered
MCP — call a verb and the broker + web come up automatically. Then open
**http://localhost:13340** to watch the same terminals the agent drives.

> The older "the MCP never spawns a process — run `pnpm dev` yourself" model is superseded
> by this supervisor. `pnpm dev` still works for hacking on the broker/web directly (see
> [`SETUP.md`](./SETUP.md)), but it is no longer required for normal agent use.

## Configuration
All settings have built-in code defaults and three override layers (highest wins):

1. **The MCP client's `env:` block** (`.mcp.json` / `claude mcp add --env`) — per agent / per client.
2. **A project-local `.env`** in the working directory.
3. **A global `~/.ddx-term/.env`** — applies to every client on the machine.

Copy [`.env.example`](./.env.example) to either location and edit. The MCP loads both files
(via `src/load-dotenv.ts`) before resolving ports; the broker + web load them too for the
standalone `pnpm dev` path. `override: false` means an explicitly-set env var always beats a
file — so the per-client `env:` block is authoritative.

Full env-var table + per-package deps: [`DEPENDENCIES.md`](./DEPENDENCIES.md) and
[`ddx-documentation/03-mcp-reference/configuration.md`](./ddx-documentation/03-mcp-reference/configuration.md).

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
