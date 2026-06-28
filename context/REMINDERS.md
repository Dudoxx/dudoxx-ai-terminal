# Project Reminders — dudoxx-ai-terminal
> Quick-reference card. Auto-updated by hooks. Edit manually for permanent reminders.

## Stack Versions
- pnpm: 10.24.0 · turbo: 2.5 · typescript: 5.7 · node: >=20.9
- NestJS (broker): 11 · Next.js (web): 16.2.6 · zod: 4.3 · @modelcontextprotocol/sdk: 1.12

## Critical Pitfalls
- [MCP] NEVER add a PTY (node-pty/pty.spawn/raw shell) — shells to tmux only; no-pty.spec.ts guards it.
- [BROKER] NEVER `set-window-option -g window-size manual` — kills tmux 3.6a on headless new-window.
- [BROKER] Always create the session with `tmux -f /dev/null` (no ~/.tmux.conf inheritance).
- [MCP] send-keys is `-l` literal + SEPARATE Enter — never embed `\n`.
- [PUBLISH] README's "npx not available yet" note is STALE — tsup bundles the contract; MCP IS publishable.
- [CONFIG] npm strips data URIs from package.json — host logos on a CDN/raw host, never inline.

## Active Plan
- plans/ddx-terminal-bridge/ — see _index.md

## Running Services & Ports
- ddx-term-broker: http://127.0.0.1:6481 (DDX_TERM_BROKER_PORT) · Swagger /docs
- ddx-term-web: http://localhost:3460
- ddx-term-mcp: stdio (launched by MCP client, not a dev server)
- tmux session: ddx-shared · socket /tmp/ddx-term.sock

## Environment Notes
- MCP env: DDX_TERM_SOCKET, DDX_TERM_SESSION, DDX_TERM_DEFAULT, DDX_TERM_ALLOWLIST,
  DDX_TERM_MAX_READ_LINES (2000), DDX_TERM_MAX_TERMINALS (16), DDX_TERM_BROKER_URL.
- Broker binds 127.0.0.1 only (no auth by design — v1 localhost dev tool).

## Permanent Reminders (manual — never auto-deleted)
- Only `@dudoxx/ddx-term-mcp` publishes to npm. Add a changeset per change; CI opens a Version PR.
- Verify with `pnpm typecheck && pnpm lint && pnpm test` before any commit. Never `pnpm dev` in-agent.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
