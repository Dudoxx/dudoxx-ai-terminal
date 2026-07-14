# Shard 06 — MCP: tmux-client hardening

- **Task**: `tasks/task_006.json`
- **Agent**: `ddx-term-mcp-specialist`
- **Skills**: typescript-strict, nestjs-backend
- **Rules**: `_invariants.md`, `ddx-term-mcp/CLAUDE.md`, root CLAUDE.md
- **WS**: WS5 · **Wave**: 5 (independent) · **Group**: A · **Depends**: —

## Why this scope
The MCP server is healthy — this is targeted hardening, no restructure. Four items:
(1) un-swallow exec errors (`tmux.client.ts:279-282,331-333` — distinguish pgrep
exit-1 no-match from a real fault); (2) DRY the duplicated `TmuxExecError` wrap in
`newSession` (:110-138) into a shared helper (keep global-flag-before-`-S`);
(3) D3 — document the intentional non-reset cursor in `term-wait-for.tool.ts`;
(4) D4 — `term-ps.tool.ts:21` switch `processes[]` to full `descendantPids`
(grandchildren), `fgPid` stays the direct child.

## Critical guardrail
MCP server NEVER holds a PTY — `execFile` tmux/ps/pgrep/kill only; `no-pty.spec.ts`
stays green. Do NOT restructure resolver/registry/dispatch; do NOT re-report the 3
fixed prod-launch bugs; no supervisor deep audit (WS5 NOT).

## Parallelism
Fully independent of the web/broker chain — runs any time.
