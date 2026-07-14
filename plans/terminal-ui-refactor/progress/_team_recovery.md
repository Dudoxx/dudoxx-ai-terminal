# Team Recovery Log — terminal-ui-refactor

## 2026-07-14 · accidental teammate reap + recovery
- Wave 1: impl-broker-terminal (001→002), impl-web-terminal (005→003→004), impl-mcp-terminal (006).
- 001 ✅, 005 ✅, 006 ✅ landed clean.
- LEAD ERROR: impl-mcp-terminal reported 3 live background task IDs (t65v55dx4/tpx808lk8/thlul0as1)
  via its SubagentStop hook — these were the THREE TEAM MEMBERS, not its own children. Lead
  TaskStop'd all three, killing impl-broker-terminal (mid-task-002) and impl-web-terminal (idle,
  holding for wave 2) in addition to the intended impl-mcp-terminal.
- RECOVERY: task 002 was ~90% on disk (gateway restore-on-attach +56, terminal.service scrollback
  +59, contract frame done; only term.gateway.spec.ts left RED, ~10 TS errors from a half-applied
  spec-harness refactor). No progress/002.md checkpoint existed. Respawned impl-broker-terminal-2
  to RESUME 002 from disk (finish the spec harness + validate) — not restart. Task state survived
  on disk per Step 8a revival pattern; only the dead teammates' context was lost (acceptable).
- LESSON: never TaskStop an ID reported by a peer without confirming ownership first — the stop
  result's `command` preview names the victim; check BEFORE stopping, not after.
- impl-web-terminal (wave 2) to be respawned fresh once 002 lands.
