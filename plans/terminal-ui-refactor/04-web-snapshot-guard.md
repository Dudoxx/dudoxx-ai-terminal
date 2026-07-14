# Shard 04 — Web: snapshot/live-frame buffering guard

- **Task**: `tasks/task_004.json`
- **Agent**: `ddx-term-web-specialist`
- **Skills**: frontend-stack, typescript-strict
- **Rules**: `_invariants.md`, `ddx-term-web/CLAUDE.md`, root CLAUDE.md
- **WS**: WS3 · **Wave**: 3 · **Group**: C · **Depends**: task_002, task_003

## Why this scope
`xterm-client.ts` resolves `connect()` before the socket is truly open, so live
frames interleave with the snapshot write — garbled scrollback on (re)attach and
rapid tab switch (FM2). Fix = buffer live frames until the snapshot is painted,
then flush in order. With task_002 shipped, the first frame is now the broker's
authoritative `snapshot` frame — consume it (`restoreSnapshot`) and drop the
redundant REST fetch (keep as fallback for older brokers).

## Guardrails
- No double-decode of tmux escapes (broker already decoded in task_002).
- Disposed client must not flush/reconnect — extend the `this.disposed` net to the
  flush path.
- Do NOT rewrite reconnect-backoff (WS3 NOT). Do NOT change the frame schema (that
  was task_001).

## Reciprocal pair
Consumer of the `snapshot` frame emitted by broker task_002. Aligns the route mount
from task_003 with the buffering sequence.
