<!-- ddx-hero:v1 -->
<p align="center">
  <a href="https://www.dudoxx.com">
    <img src="https://raw.githubusercontent.com/Dudoxx/dudoxx-ai-terminal/main/ddx-term-mcp/assets/dudoxx-logo.png" alt="Dudoxx" width="80" />
  </a>
</p>

<h1 align="center">Installation — @dudoxx/ddx-term-mcp</h1>

<p align="center">
  <em>Set up the shared-terminal MCP server in any MCP client.</em>
</p>

---
<!-- /ddx-hero:v1 -->

## 1. Prerequisites

| Requirement | Check | Install |
|---|---|---|
| Node.js ≥ 20.9 | `node -v` | [nodejs.org](https://nodejs.org) / `nvm install 20` |
| tmux ≥ 3.3 | `tmux -V` | macOS `brew install tmux` · Debian/Ubuntu `apt install tmux` |
| An MCP client | — | Claude Code, Claude Desktop, or any MCP-capable host |

> **Windows:** run under WSL2 — tmux is required and is not native to Windows.

## 2. Install

You do not need to clone anything. `npx` fetches and runs the published package:

```sh
npx -y @dudoxx/ddx-term-mcp
```

You should see it connect over stdio:

```
[ddx-term-mcp] connected. socket=/tmp/ddx-term.sock session=ddx-shared default=t01
```

Press `Ctrl-C` to stop — your MCP client will launch it on demand.

## 3. Register it with your client

### Claude Code (CLI)

```sh
claude mcp add ddx-term \
  --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- npx -y @dudoxx/ddx-term-mcp

claude mcp list          # expect: ddx-term … ✔ Connected
```

`--scope user` makes it available in every project. Drop the flag for project-only.

### Claude Desktop / any `.mcp.json`

Add to the client's MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS, or a project `.mcp.json`):

```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "npx",
      "args": ["-y", "@dudoxx/ddx-term-mcp"],
      "env": {
        "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
        "DDX_TERM_SESSION": "ddx-shared",
        "DDX_TERM_DEFAULT": "t01"
      }
    }
  }
}
```

Restart the client. The 10 tools (`term_create`, `term_send`, `term_read`, …) appear
in its tool list.

## 4. Configuration reference

| Env | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket path of the shared session |
| `DDX_TERM_SESSION` | `ddx-shared` | the session that hosts every terminal (one window each) |
| `DDX_TERM_DEFAULT` | `t01` | `terminalId` used when a verb omits one |
| `DDX_TERM_ALLOWLIST` | _(unset)_ | path to a command allow-list file; unset = every command allowed |
| `DDX_TERM_MAX_READ_LINES` | `2000` | hard cap on lines a single `term_read` returns |
| `DDX_TERM_MAX_TERMINALS` | `16` | maximum terminals per session |
| `DDX_TERM_BROKER_PORT` | `13330` | broker HTTP/WS port the supervisor spawns on |
| `DDX_TERM_WEB_PORT` | `13340` | web UI HTTP port the supervisor spawns on |
| `DDX_TERM_HOST` | `127.0.0.1` | bind/connect host (loopback by design) |
| `DDX_TERM_WEB` | _(unset → web on)_ | set `0` to run broker-only (supervisor skips the web tier) |
| `DDX_TERM_BROKER_URL` | _(written by supervisor)_ | the supervisor sets this after it spawns the broker. Set by hand ONLY to attach to an already-running broker — and then it **MUST include the API prefix: `http://localhost:13330/api/v1`** (not the bare host — the broker mounts routes under `/api/v1`), else registry resolution fails silently. |

> **Overrides via `.env`.** Beyond the client `env:` block, the MCP loads a project-local
> `.env` (CWD) and a global `~/.ddx-term/.env` before resolving ports — `override: false`, so
> an explicit `env:` value always wins. Copy the repo's `.env.example` to either path to move
> the whole stack onto a different port band. The broker + web load the same files for the
> standalone `pnpm dev` path.

## 5. Watch the agent live (optional)

The session is plain tmux, so you can co-attach a real terminal and watch the agent
type in real time. In iTerm2 or WezTerm (control mode):

```sh
tmux -S /tmp/ddx-term.sock -CC attach -t ddx-shared
```

Or a normal attach in any terminal:

```sh
tmux -S /tmp/ddx-term.sock attach -t ddx-shared
```

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `tmux: command not found` | tmux not installed | Install tmux (§1) |
| Client shows ddx-term but 0 tools | server crashed on launch | Run `npx -y @dudoxx/ddx-term-mcp` directly and read the stderr |
| `no server running on /tmp/ddx-term.sock` | session not created yet | The server creates it on first `term_create`; or pre-create with `tmux -S /tmp/ddx-term.sock new-session -d -s ddx-shared` |
| Agent and human see different terminals | a second socket/session in use | Ensure the same `DDX_TERM_SOCKET` + `DDX_TERM_SESSION` on both the MCP env and your `tmux attach` |
| Node version error | Node < 20.9 | `nvm install 20 && nvm use 20` |

## 7. Run from source (contributors)

The server is part of the `dudoxx-ai-terminal` pnpm workspace:

```sh
git clone https://github.com/Dudoxx/dudoxx-ai-terminal.git
cd dudoxx-ai-terminal
pnpm install
pnpm -F @dudoxx/ddx-term-mcp dev      # tsx watch mode
pnpm -F @dudoxx/ddx-term-mcp test     # vitest (incl. real-tmux e2e)
pnpm -F @dudoxx/ddx-term-mcp build:bundle   # produce the publishable dist/server.js
```

---

## License

MIT © 2026 Dudoxx UG / Acceleate Consulting. Maintainer: Walid Boudabbous <walid@acceleate.com>.

---

<p align="center">
  <sub>Built with care by <a href="https://www.dudoxx.com">Dudoxx</a> &nbsp;·&nbsp; Hamburg</sub>
</p>
