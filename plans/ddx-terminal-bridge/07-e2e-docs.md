# Shard 07 — E2E tests + per-package CLAUDE.md (DOX) + README + .mcp.json (Group D)

**Task ids:** `D1` (e2e suite), `D2` (per-package CLAUDE.md DOX + README + .mcp.json snippet)
**Agent:** test-writer (D1) · general-purpose (D2) · **Skills:** typescript-strict
**Parallel?** Yes within group after B/C complete; D1 and D2 independent.

## Why this shard
Cross-package proof that the shared-state thesis holds, plus the DOX docs each package owes. The e2e
suite reuses the existing repo-root fixtures `ddx-cli-py` (uv + rich) and `ddx-cli-ts` (pnpm + clack) as
interactive targets — they were scaffolded and proven in SPIKE.md Spike 2 specifically to be e2e
fixtures.

## E2E coverage (D1) — each maps to an AC / Failure Mode
- **3-way attach parity** (AC #2/#3, FM#1): agent `term_send` → a second `capture-pane` client shows the
  same bytes. Spawns a real throwaway tmux on a temp socket.
- **Multi-terminal isolation** (AC #12): `term_create('a')` + `term_create('b')`; send to `a`, assert
  `term_read('b')` empty.
- **terminalId ≠ pid signal-reject** (AC #14, FM#4): `term_signal(pid)` with a foreign pid →
  `PID_NOT_IN_TERMINAL`; signalling the real foreground after a command change still works.
- **Statefulness** (AC #4): `cd /tmp` then `pwd` across separate calls preserves cwd; open `python3` REPL
  then eval.
- **Resize invariant** (AC #8, FM#2): agent headless attach does NOT change `#{window_width}`.
- **Interactive reply incl. arrow-key TUI** (AC #6/#7): drive `ddx-cli-py` Rich prompts (`-l` + Enter) and
  `ddx-cli-ts` clack `select` (`Down` key-name then `Enter`), using `term_wait_for` before each answer so
  keystrokes don't race the program (SPIKE Spike 2).
- **Delta read** (FM#3): a 1000-line output read twice returns the delta the second time.

## Docs (D2)
- Per-package `CLAUDE.md` (DOX) for `@ddx/term-contract`, `ddx-term-mcp`, `ddx-term-broker`,
  `ddx-term-web`: Purpose / Ownership / Local Contracts / Verification. `ddx-term-mcp/CLAUDE.md` MUST
  carry the "MUST NEVER hold a PTY; tmux only" invariant. Attribution: Dudoxx UG / Acceleate Consulting -
  Walid Boudabbous <walid@acceleate.com>.
- Root `README.md` — one-command bring-up (`pnpm dev` via turbo: broker + web), native-attach recipe
  (`tmux -CC attach -t ddx-shared`), and the `.mcp.json` registration snippet from MCP-SPEC §1 (with the
  `DDX_TERM_SOCKET`/`DDX_TERM_SESSION`/`DDX_TERM_DEFAULT` env).

## Boundaries
- Tests must clean up their temp tmux sockets/sessions (no leak into the user's tmux server).
- Do NOT modify product code to make a test pass — if a test fails, that is a real defect (report it).

## Verification
`pnpm -r test` green incl. e2e; the latency e2e (RESPONSIVENESS §4) emits a p50/p95 report and fails if
p95 > hard ceiling. See tasks.json `D1`,`D2`.
