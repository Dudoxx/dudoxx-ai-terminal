# Setup & Bring-up — dudoxx-ai-terminal

How to run the bridge locally and connect all three channels. Assumes
[`INSTALLATION.md`](./INSTALLATION.md) is done (`pnpm install` + `pnpm build`).

## One-command dev bring-up
```sh
pnpm dev          # turbo: broker (6481) + web (3460) together
```
- Broker: http://127.0.0.1:6481 (Swagger at `/docs`).
- Web UI: http://localhost:3460 — open this.
- The **MCP server is NOT part of `pnpm dev`** — it is launched over stdio by the MCP
  client (Claude Code / Desktop), not as a long-running process.

> Do not run `pnpm dev` inside an automated agent session — it is a long-running
> foreground process. Use `pnpm typecheck`/`test` for verification instead.

## Connect the three channels
1. **Human (web)** — open http://localhost:3460. Each terminal is a tab.
2. **Agent (MCP)** — register the MCP (see INSTALLATION) and call `term_create` /
   `term_send`; the output appears live in the web tab.
3. **Human (native, optional)** — attach the shared session in iTerm2 / WezTerm:
   ```sh
   tmux -CC attach -t ddx-shared
   ```
   This renders the same terminals as native tabs alongside the web UI and the agent.

## How the shared session is created
The **broker owns** the session — it creates/attaches `ddx-shared` on socket
`/tmp/ddx-term.sock` with `tmux -f /dev/null` (no `~/.tmux.conf` inheritance) and pins
size 120×30. You do NOT create the session manually; starting the broker does it.

## Smoke test
```sh
# with `pnpm dev` running and the MCP registered:
# 1. In the web UI you should see at least the default terminal (t01).
# 2. From the agent: term_send t01 "echo hello" enter:true → "hello" appears in the web tab.
# 3. term_snapshot t01 → returns the visible viewport.
```

## Stopping
`Ctrl-C` the `pnpm dev` process. The tmux session is deliberately NOT killed (so
`term_list` + the web viewer reconnect after a broker restart via `reconcileRegistry()`).
To tear down the session entirely: `tmux -S /tmp/ddx-term.sock kill-session -t ddx-shared`.

## Ports & env
See [`DEPENDENCIES.md`](./DEPENDENCIES.md) and `context/REMINDERS.md` for the port map
and the full MCP env-var table.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
