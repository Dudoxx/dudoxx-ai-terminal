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

> **Publishing is wired — `@dudoxx/ddx-term-mcp` ships as a self-contained npm
> package.** Its publish bundle (`build:bundle`, tsup) inlines `@ddx/term-contract`
> from source into a single `dist/server.js` (`noExternal: ['@ddx/term-contract']`),
> keeping only `zod` + `@modelcontextprotocol/sdk` as external runtime deps. That
> bundle is wired as `prepublishOnly`, so the published tarball carries **no
> `workspace:*` reference** — the contract stays `"private": true` and is never
> published separately (by design; it lives in the changeset `ignore[]`). Once a
> version is released to the registry (see **Release & versioning** below), the
> `npx -y @dudoxx/ddx-term-mcp` form resolves. Until the first registry release,
> register by absolute path as above.

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

## Release & versioning (Changesets → npm)

Only **`@dudoxx/ddx-term-mcp`** publishes to public npm; broker, web, and the
contract are `"private": true` and listed in `.changeset/config.json` `ignore[]`.

```sh
pnpm changeset      # 1. describe the change + pick a bump (patch/minor/major)
git commit && push  # 2. open a PR that includes the .changeset/*.md
```

On merge to `main`, `.github/workflows/release.yml` runs Changesets' action:

1. It opens (or updates) a **"Version Packages" PR** that bumps `package.json`,
   writes `CHANGELOG.md`, and consumes the changeset files.
2. Merging **that** PR triggers `pnpm release` → `build:bundle` (tsup, inlines the
   contract) → `changeset publish` → `npm publish` of any package whose version changed.

The publish authenticates via the repo secret **`NPM_TOKEN`** (an npm automation
token with publish rights to the `@dudoxx` scope) and emits provenance
(`NPM_CONFIG_PROVENANCE=true`). After the first release lands, the
`npx -y @dudoxx/ddx-term-mcp` registration form resolves.

> Verify a tarball before publishing: `cd ddx-term-mcp && pnpm build:bundle &&
> npm pack --dry-run` — it must list `dist/server.js` (self-contained, no
> `workspace:*`), `package.json`, `README.md`, `INSTALLATION.md`, `LICENSE`, and
> the two `assets/*.png`.

For the full release walkthrough, bump-type guidance, and CI details see
[`CLAUDE_PUBLISHING.md`](./CLAUDE_PUBLISHING.md) and
[`ddx-documentation/05-publishing/release-flow.md`](./ddx-documentation/05-publishing/release-flow.md).

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
