# Shard 01 — Contract: snapshot/scrollback frame

- **Task**: `tasks/task_001.json`
- **Agent**: `ddx-term-broker-specialist`
- **Skills**: typescript-strict, frontend-stack
- **Rules**: `_invariants.md`, `packages/ddx-term-contract/CLAUDE.md`, root CLAUDE.md
- **WS**: WS4 (contract half) · **Wave**: 1 · **Group**: A · **Depends**: —

## Why this scope
Restore-on-attach (broker) and buffer-until-painted (web) both need a new
server→client frame that carries the current screen + BOUNDED scrollback. Per the
repo invariant, any new cross-boundary frame lands in `@ddx/term-contract` FIRST
(turbo DAG: contract builds before broker/mcp/web), so this is its own task and
the head of the dependency chain. The frame union is explicitly OPEN for new
variants (`ws-frames.ts:12-13`) — additive, non-breaking.

## Shape (see task node for exact steps)
`SnapshotFrameSchema` (type `'snapshot'`) extends `FrameBase` (terminalId
non-negotiable) with `data`, `withAnsi?`, `cols`, `rows`, `scrollbackLines?`
(undefined = viewport-only). Registered in `ServerFrameSchema` + `TermFrameSchema`
+ `TERM_FRAME_TYPES`.

## Reciprocal pair
Producer = broker (task_002 sends it). Consumer = web (task_004 restores it).
This task defines the wire type both sides import.
