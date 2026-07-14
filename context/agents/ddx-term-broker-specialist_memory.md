# ddx-term-broker-specialist — memory (session pitfalls, cap 80 lines)

<!-- one-line entries: [DOMAIN] · TYPE · lesson. (commit) -->
2026-06-28 · [TERM-BROKER] · PITFALL · Don't rely on `tmux -CC attach` to manage session state; use a separate registry for reconciliation.
2026-06-28 · [TERM-BROKER] · RULE · Ensure terminal session destruction is idempotent to prevent race conditions.
2026-07-10 · [TERM-BROKER] · PITFALL · Unbounded reconnects can exhaust PTY resources; cap retries and use exponential backoff.
2026-07-10 · [TERM-BROKER] · RULE · Implement a circuit breaker for persistent control-mode attach failures.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `tmux kill-window` fails if the window ID is invalid.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `term_signal` requires a valid signal name, not undefined.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `PID_NOT_IN_TERMINAL` error occurs when a PID is not part of the specified terminal's process tree.
2026-07-10 · [TERM-BROKER] · PITFALL · Reconnecting control-mode without stopping PTYs leaks masters.
2026-07-10 · [TERM-BROKER] · RULE · Always reap PTY masters when closing terminals to prevent leaks.
2026-07-10 · [TERM-BROKER] · RULE · Cap concurrent terminals to avoid resource exhaustion.
2026-07-14 · [TERM-BROKER] · PITFALL · Adding a cold-attach snapshot push (handleConnection) means every WS test asserting raw message-array length must filter it out (e.g. `liveMessages()`) or routing/coalescing assertions go off-by-one.
2026-07-14 · [TERM-BROKER] · DISCOVERY · `control-mode.attach.spec.ts` cannot run in an agent sandbox (needs a real tmux+pty) — scope other broker specs (`--testPathIgnorePatterns='control-mode.attach.spec'`) to validate a diff without hanging on the full `pnpm test`.
2026-07-14 · [TERM-BROKER] · RULE · Restore-on-attach must be byte-fidelity — raw snapshot concatenation with no inserted whitespace; verify against the broker's raw capture, not eyeballed rendering. (aa064a2)
2026-07-14 · [CONTRACT] · RULE · New WS frame: contract package FIRST, then producer shard (broker `pushX`) + consumer shard, closed by an exhaustive-`never` switch. (aa064a2)
