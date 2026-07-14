# Shard 02 — Broker: restore-on-attach + bounded scrollback

- **Task**: `tasks/task_002.json`
- **Agent**: `ddx-term-broker-specialist`
- **Skills**: nestjs-backend, typescript-strict
- **Rules**: `_invariants.md`, `ddx-term-broker/CLAUDE.md`, root CLAUDE.md
- **WS**: WS4 · **Wave**: 1 · **Group**: A · **Depends**: task_001

## Why this scope
`handleConnection` (`term.gateway.ts:168-206`) subscribes a client but pushes no
initial state — the screen is blank until the next live `%output`. This closes the
broker snapshot/subscribe race by pushing an authoritative `snapshot` frame the
instant a socket subscribes. D1=YES adds a SEPARATE bounded `-S` capture method
(`terminal.service.ts`), never mutating the existing viewport-only `snapshot()`.

## Guardrails (full list in task pitfalls)
- Bounded `-S <SCROLLBACK_LINES>` only — never bare/unbounded (FM#3).
- Decode tmux control-mode escapes (`\033`/`\015`) to raw bytes before framing.
- Broker node-pty stays (it is the legitimate `tmux -CC` attach — NOT the MCP
  no-PTY rule).
- Dims 120×30 pinning + `reconcileRegistry` untouched.

## Reciprocal pair
Emits the `snapshot` frame (contract task_001) → consumed by web task_004
(buffer-until-painted). Push BEFORE live frames interleave.
