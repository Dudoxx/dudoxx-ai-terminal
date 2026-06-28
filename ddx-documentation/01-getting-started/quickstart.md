---
title: Quickstart
description: Bring the bridge up — pnpm dev for broker + web at :3460, register the MCP agent channel, and attach natively via iTerm2 tmux -CC.
audience: developers
tags: [quickstart, pnpm-dev, mcp-registration, tmux-cc, walkthrough]
updated: 2026-06-28
---

# Quickstart

This walks all three channels onto the same shared tmux session.

## 1. Start the human channel (broker + web)

```sh
pnpm dev          # turbo run dev → broker (6481) + web (3460), concurrently
```

Open the web UI at **http://localhost:3460**. The broker creates (or re-adopts) the
`ddx-shared` tmux session on socket `/tmp/ddx-term.sock` and renders its terminals as
tabs. Each tab is one `terminalId`; switching tabs resubscribes the WS and restores a
snapshot rather than reconnecting.

## 2. Build the agent channel binary

The MCP server is spawned by the MCP client, so it needs a built `dist/server.js`:

```sh
pnpm --filter @dudoxx/ddx-term-mcp build   # → ddx-term-mcp/dist/server.js (executable)
```

## 3. Register the MCP server (agent channel)

The fastest path once the package is published to npm:

```sh
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- npx -y @dudoxx/ddx-term-mcp
```

For local development (unpublished), point at the built binary by absolute path:

```sh
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- node "$PWD/ddx-term-mcp/dist/server.js"
```

Verify the connection:

```sh
claude mcp list      # look for: ddx-term … ✔ Connected
```

Full registration options (project `.mcp.json`, user scope, npx) are in
[registration](../03-mcp-reference/registration.md). All env vars are documented in
[configuration](../03-mcp-reference/configuration.md).

## 4. Drive it from the agent

Once connected, the agent has 10 verbs. A minimal smoke sequence:

```text
term_list                                  → see existing terminals
term_send  { text: "echo hello", enter: true }   → type into the default terminal (t01)
term_read                                  → read the new output (delta)
term_snapshot                              → look at the whole visible screen
```

The `echo hello` you sent appears **live in the web UI** at :3460 — that shared-state
property is the whole point. Full tool reference: [tools](../03-mcp-reference/tools.md).

## 5. (Optional) Attach natively, no browser

Because the bridge IS a standard tmux session, attach with any control-mode client.
iTerm2 and WezTerm render tmux `-CC` as native tabs:

```sh
tmux -CC attach -t ddx-shared
```

You now have the human (browser), the agent (MCP), and a native terminal emulator all
looking at — and able to drive — the exact same terminals.

## Verify the whole tree

```sh
pnpm typecheck    # turbo run typecheck across all packages
pnpm lint
pnpm test         # unit + e2e (e2e spins a throwaway tmux on a temp socket)
```

## Next

- [Architecture](../00-overview/architecture.md) — the model you just brought up.
- [Tools](../03-mcp-reference/tools.md) — the full agent verb surface.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
