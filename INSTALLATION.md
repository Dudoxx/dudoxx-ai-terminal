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
        "DDX_TERM_DEFAULT": "t01"
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
  -- node "$PWD/ddx-term-mcp/dist/server.js"
```
Verify: `claude mcp list` → `ddx-term … ✔ Connected`.

> Once `@dudoxx/ddx-term-mcp` is released to npm, `npx -y @dudoxx/ddx-term-mcp` works as the
> `command` and no local build is needed. See [`CLAUDE_PUBLISHING.md`](./CLAUDE_PUBLISHING.md).

## Configuration
All MCP env vars + defaults: [`DEPENDENCIES.md`](./DEPENDENCIES.md) and
[`ddx-documentation/03-mcp-reference/configuration.md`](./ddx-documentation/03-mcp-reference/configuration.md).

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
