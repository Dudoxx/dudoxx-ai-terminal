# dudoxx-ai-terminal

**Shared multi-terminal bridge** — one tmux session, many addressable terminals,
attached by a **human** (web / xterm.js) and an **AI agent** (MCP) *simultaneously*,
both looking at the exact same terminals. Architecture in one line: a single
pinned-size `tmux` session is the shared state; a NestJS **broker** owns the
canonical terminal registry and fans output to the web UI per-terminal over
WebSocket; an **MCP** server lets Claude shell out to the same tmux session (it
holds no PTY); a Next.js **web** app renders the terminals with xterm.js.

## Packages

| Package | Role | Port / transport |
|---|---|---|
| `@ddx/term-contract` (`packages/ddx-term-contract`) | Shared zod types — WS frames, MCP tool I/O, terminal/session descriptors | library (ESM+CJS+types) |
| `ddx-term-broker` | Human channel + canonical state: tmux control-mode attach, registry, REST CRUD, per-terminalId WS | HTTP/WS **6481** (`DDX_TERM_BROKER_PORT`) |
| `@dudoxx/ddx-term-mcp` | Agent channel: MCP stdio server, thin tmux client (no PTY) | stdio (`node dist/server.js`) |
| `ddx-term-web` | Next.js 16 xterm.js UI, one tab per terminalId | HTTP **3460** |

> `ddx-cli-py` / `ddx-cli-ts` are interactive e2e-target fixtures, **not** workspace
> packages — they are never built or published from here.

## One-command bring-up

```sh
pnpm install
pnpm dev          # turbo run dev → broker (6481) + web (3460) together
```

`pnpm dev` runs the broker and web concurrently via turbo. Open the web UI at
**http://localhost:3460**. The MCP server is **not** part of `pnpm dev` — it is
launched over **stdio by the MCP client** (Claude Code / Claude Desktop), not as a
long-running dev process. Build it once so the client has a binary to spawn:

```sh
pnpm build                                   # builds all packages incl. ddx-term-mcp/dist/server.js
# or just the MCP server + its contract dep:
pnpm --filter @dudoxx/ddx-term-mcp... build
```

## Register the MCP server (agent channel)

Add this to a Claude Code project's `.mcp.json` (or your Claude Desktop config).
A copy lives in [`.mcp.json.example`](./.mcp.json.example) — replace `/abs/path`
with this repo's absolute path:

```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "node",
      "args": ["/abs/path/dudoxx-ai-terminal/ddx-term-mcp/dist/server.js"],
      "env": {
        "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
        "DDX_TERM_SESSION": "ddx-shared",
        "DDX_TERM_DEFAULT": "t01"
      }
    }
  }
}
```

| Env | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket of the shared session |
| `DDX_TERM_SESSION` | `ddx-shared` | session hosting all terminals (windows) |
| `DDX_TERM_DEFAULT` | `t01` | terminalId used when a verb omits `terminalId` |

### Global install (every Claude Code session)

The package is `bin`-shaped (`ddx-term-mcp` → `dist/server.js`) with a `prepare`
script that builds on install. To register it for **all** projects, add it to your
user-scope MCP config via the CLI (run from this repo so `$PWD` resolves):

```sh
pnpm -F @dudoxx/ddx-term-mcp build      # produces an executable dist/server.js
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- node "$PWD/ddx-term-mcp/dist/server.js"
```

Verify with `claude mcp list` (look for `ddx-term … ✔ Connected`).

> **`npx -y @dudoxx/ddx-term-mcp` is NOT available yet.** Both this package and
> `@ddx/term-contract` are `"private": true` and the contract is a `workspace:*`
> dependency — neither is published to a registry, so the `npx` form cannot
> resolve. To enable it later: drop `private`, replace the `workspace:*` contract
> dep with a published semver range (or bundle the contract into `dist/`), and
> `npm publish` both. Until then, register by absolute path as above.

The MCP server is a **thin tmux client — it never owns a PTY** (no `node-pty`); it
shells out to tmux against the same session the broker and the human are attached
to. That shared-state property is the whole point: a command the agent types is
visible live in the web UI.

## Attach natively from a real terminal emulator (human channel, no browser)

Because the bridge IS a standard tmux session, you can also attach with a native
tmux control-mode client — iTerm2 and WezTerm render tmux `-CC` natively:

```sh
tmux -CC attach -t ddx-shared
```

This opens the shared terminals as native tabs/windows in iTerm2 / WezTerm,
alongside the web UI and the agent — all three see the same terminals.

## Verification

```sh
pnpm typecheck      # turbo run typecheck across all packages
pnpm lint
pnpm test           # turbo run test (unit + e2e; e2e spins throwaway tmux on a temp socket)
```

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
