<!-- ddx-hero:v1 -->
<p align="center">
  <a href="https://www.dudoxx.com">
    <img src="assets/dudoxx-logo.png" alt="Dudoxx" width="96" />
  </a>
</p>
<p align="center">
  <img src="assets/dudoxx-typography.png" alt="dudoxx" width="220" />
</p>

<h1 align="center">@dudoxx/ddx-term-mcp</h1>

<p align="center">
  <strong>An MCP server that lets an AI agent and a human share the same live terminal.</strong><br/>
  <em>One tmux session, many addressable terminals — driven over stdio by Claude, watched live by you.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dudoxx/ddx-term-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@dudoxx/ddx-term-mcp?style=flat-square&color=1f6feb"/></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/license-MIT-1f6feb?style=flat-square"/></a>
  <a href="https://modelcontextprotocol.io"><img alt="MCP" src="https://img.shields.io/badge/MCP-stdio-1F7A7A?style=flat-square"/></a>
  <a href="https://www.dudoxx.com"><img alt="Built by Dudoxx" src="https://img.shields.io/badge/built%20by-Dudoxx-1f6feb?style=flat-square"/></a>
</p>

---
<!-- /ddx-hero:v1 -->

## What it is

`ddx-term-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) stdio
server — the **agent channel** of the Dudoxx terminal bridge. It lets Claude Code
(or any MCP client) drive the **same** terminal a human is watching: the agent runs
a command, you see it execute live; you type, the agent sees the output.

It is a **thin client over `tmux`**. It never owns a PTY — every action shells out to
`tmux send-keys` / `capture-pane` against one shared session. That single design
choice is what keeps human and agent looking at the identical terminal, instead of
two private copies that drift apart.

## Why a thin tmux client (not a PTY)

The naive way to build a terminal-for-agents is to spawn a pseudo-terminal
(`node-pty`) the agent owns. That breaks the moment a human wants to watch — they'd
be looking at a different process. `ddx-term-mcp` holds **no PTY**; `tmux` is the
single source of truth, so a human attached with `tmux -CC attach` and the agent over
MCP are provably on the same session.

## Requirements

- **Node.js ≥ 20.9**
- **`tmux` ≥ 3.3** on the host (`brew install tmux` / `apt install tmux`)

## Quick start

Register it in any MCP client (Claude Code shown):

```sh
claude mcp add ddx-term \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  -- npx -y @dudoxx/ddx-term-mcp
```

Or add it to a `.mcp.json` / Claude Desktop config by hand:

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

Full setup, native co-attach recipe, and troubleshooting → **[INSTALLATION.md](INSTALLATION.md)**.

## The tools (9 verbs + 2 helpers)

| Tool | What it does |
|---|---|
| `term_create` | Allocate a new terminal (a tmux window) with a stable `terminalId` |
| `term_list` | Enumerate all terminals + live process snapshots |
| `term_destroy` | Kill a terminal and free its `terminalId` |
| `term_send` | Type literal text (`send-keys -l`) + a separate `Enter` — never a raw `\n` |
| `term_read` | Return the scrollback **delta** since your last read (token-frugal by default) |
| `term_snapshot` | Return the **visible viewport** grid right now (for TUIs, prompts, spinners) |
| `term_wait_for` | Block until a regex matches or a timeout — call before answering prompts |
| `term_signal` | Send a signal/key (Ctrl-C/D/Z); validates the pid is in the terminal's tree |
| `term_ps` | Live `panePid` + `fgPid` for a terminal (transient, distinct from `terminalId`) |
| `term_panes` | Pane geometry for a terminal |

**Two identifiers, never conflated:** address terminals by `terminalId` (durable,
= a tmux window); observe/signal processes by `pid` (transient). `term_signal`
refuses any pid that isn't inside the terminal's own process tree.

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket of the shared session |
| `DDX_TERM_SESSION` | `ddx-shared` | session hosting all terminals (windows) |
| `DDX_TERM_DEFAULT` | `t01` | `terminalId` used when a verb omits one |
| `DDX_TERM_ALLOWLIST` | _(unset)_ | optional command allow-list; unset = all allowed |
| `DDX_TERM_MAX_READ_LINES` | `2000` | hard cap on lines any single read returns |
| `DDX_TERM_MAX_TERMINALS` | `16` | max terminals per session |
| `DDX_TERM_BROKER_URL` | _(unset)_ | set → resolve terminals against a running broker; unset → standalone |

## Watch the agent work (native co-attach)

Because it's just tmux, you can attach a real terminal to the same session and
watch the agent type in real time:

```sh
tmux -S /tmp/ddx-term.sock -CC attach -t ddx-shared   # iTerm2 / WezTerm control mode
```

## License

MIT © 2026 Dudoxx UG / Acceleate Consulting. Maintainer: Walid Boudabbous <walid@acceleate.com>.

---

<p align="center">
  <sub>Built with care by <a href="https://www.dudoxx.com">Dudoxx</a> &nbsp;·&nbsp; Hamburg</sub>
</p>
