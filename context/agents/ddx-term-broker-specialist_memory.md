# ddx-term-broker-specialist — memory (session pitfalls, cap 80 lines)

<!-- one-line entries: [DOMAIN] · TYPE · lesson. (commit) -->
2026-06-28 · [TERM-BROKER] · PITFALL · Don't rely on `tmux -CC attach` to manage session state; use a separate registry for reconciliation.
2026-06-28 · [TERM-BROKER] · RULE · Ensure terminal session destruction is idempotent to prevent race conditions.
2026-07-10 · [TERM-BROKER] · PITFALL · Unbounded reconnects can exhaust PTY resources; cap retries and use exponential backoff.
2026-07-10 · [TERM-BROKER] · RULE · Implement a circuit breaker for persistent control-mode attach failures.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `tmux kill-window` fails if the window ID is invalid.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `term_signal` requires a valid signal name, not undefined.
2026-07-10 · [TERM-BROKER] · DISCOVERY · `PID_NOT_IN_TERMINAL` error occurs when a PID is not part of the specified terminal's process tree.
